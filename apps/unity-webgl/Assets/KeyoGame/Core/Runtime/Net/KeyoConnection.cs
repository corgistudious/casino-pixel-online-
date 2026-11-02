using System;
using KeyoGame.Protocol;
using Newtonsoft.Json.Linq;

namespace KeyoGame.Net
{
    public enum ConnectionState
    {
        Idle,
        Connecting,
        Authenticating,
        Ready,
        /// <summary>Lost; a reconnect is scheduled.</summary>
        WaitingToReconnect,
        /// <summary>The server rejected the session (4001): a new sign-in is required. No reconnect.</summary>
        SessionExpired,
        Stopped,
    }

    /// <summary>
    /// The single connection to the Keyo gateway. Deterministic and engine-agnostic: the host calls
    /// <see cref="Tick"/> every frame with a monotonic clock; time never comes from anywhere else.
    ///
    /// Rules (STABILITY / DATA SAFETY first):
    /// - Requests are only sent while Ready; otherwise they fail at once with not_connected (no queueing,
    ///   so a bet can never be sent late or twice).
    /// - Nothing is ever re-sent. On disconnect every pending request fails with connection_lost
    ///   (outcome unknown) and, after the reconnect, <see cref="Resynced"/> tells game code to re-join and
    ///   re-read authoritative state.
    /// - A heartbeat (ping) detects dead sockets, which iOS leaves behind after background / app switch.
    ///   <see cref="OnForeground"/> checks immediately instead of waiting for the next beat.
    /// </summary>
    public sealed class KeyoConnection
    {
        public int RequestTimeoutMs { get; set; } = 10000;
        public int HeartbeatIntervalMs { get; set; } = 20000;
        public int HeartbeatTimeoutMs { get; set; } = 8000;

        public ConnectionState State { get; private set; } = ConnectionState.Idle;
        /// <summary>The authenticated user from the auth answer ({user: PublicUser}).</summary>
        public JToken User { get; private set; }

        public event Action<ConnectionState> StateChanged;
        /// <summary>Server push (event name, data).</summary>
        public event Action<string, JToken> EventReceived;
        /// <summary>Ready again after a reconnect: re-join rooms and re-read state.</summary>
        public event Action Resynced;

        private readonly ITransport _transport;
        private readonly Func<string> _tokenProvider;
        private readonly ReconnectPolicy _policy;
        private readonly PendingRequests _pending = new PendingRequests();
        private readonly Func<string> _newId;
        private string _url;
        private long _now;
        private long _reconnectAtMs;
        private long _readySinceMs;
        private long _nextBeatAtMs;
        private string _beatId;
        private bool _wasReadyBefore;
        private bool _expectClose;

        public KeyoConnection(ITransport transport, Func<string> tokenProvider, ReconnectPolicy policy = null, Func<string> newId = null)
        {
            _transport = transport ?? throw new ArgumentNullException(nameof(transport));
            _tokenProvider = tokenProvider ?? throw new ArgumentNullException(nameof(tokenProvider));
            _policy = policy ?? new ReconnectPolicy();
            _newId = newId ?? RequestIds.Next;
            _transport.Opened += OnOpened;
            _transport.MessageReceived += OnMessage;
            _transport.Closed += OnClosed;
        }

        public int PendingCount => _pending.Count;

        public void Start(string url, long nowMs)
        {
            _url = url;
            _now = nowMs;
            _policy.Reset();
            Open();
        }

        public void Stop()
        {
            _expectClose = true;
            SetState(ConnectionState.Stopped);
            _pending.FailAll(RequestResult.ConnectionLost);
            _transport.Close(1000, "client stop");
        }

        /// <summary>Sends a request. The callback runs exactly once.</summary>
        public void Request(string type, JObject payload, Action<RequestResult> callback, int? timeoutMs = null)
        {
            if (State != ConnectionState.Ready)
            {
                callback?.Invoke(RequestResult.Fail(RequestResult.NotConnected));
                return;
            }
            var id = _newId();
            _pending.Add(id, type, _now, timeoutMs ?? RequestTimeoutMs, callback);
            _transport.Send(ClientMessage.Serialize(type, id, payload));
        }

        /// <summary>Drives timers. Call every frame with a monotonic clock in ms.</summary>
        public void Tick(long nowMs)
        {
            _now = nowMs;
            _pending.Tick(nowMs);
            switch (State)
            {
                case ConnectionState.WaitingToReconnect:
                    if (nowMs >= _reconnectAtMs) Open();
                    break;
                case ConnectionState.Ready:
                    if (_readySinceMs > 0 && nowMs - _readySinceMs >= _policy.StableAfterMs) { _policy.Reset(); _readySinceMs = 0; }
                    if (_beatId == null && nowMs >= _nextBeatAtMs) SendHeartbeat();
                    break;
            }
        }

        /// <summary>The app/page came back to the foreground (visibilitychange, pageshow, focus).</summary>
        public void OnForeground()
        {
            if (State == ConnectionState.WaitingToReconnect) { Open(); return; }
            if (State == ConnectionState.Ready && _beatId == null) SendHeartbeat();
        }

        private void Open()
        {
            _expectClose = false;
            SetState(ConnectionState.Connecting);
            _transport.Open(_url);
        }

        private void OnOpened()
        {
            if (State != ConnectionState.Connecting) return;
            var token = _tokenProvider();
            if (string.IsNullOrEmpty(token))
            {
                _expectClose = true;
                SetState(ConnectionState.SessionExpired);
                _transport.Close(1000, "no session");
                return;
            }
            SetState(ConnectionState.Authenticating);
            var id = _newId();
            _pending.Add(id, "auth", _now, RequestTimeoutMs, OnAuthAnswer);
            _transport.Send(ClientMessage.Serialize("auth", id, new JObject { ["token"] = token }));
        }

        private void OnAuthAnswer(RequestResult r)
        {
            if (State != ConnectionState.Authenticating) return;
            if (!r.Ok)
            {
                if (r.ErrorCode == "unauthorized" || r.ErrorCode == "banned" || r.ErrorCode == "session_expired")
                {
                    _expectClose = true;
                    SetState(ConnectionState.SessionExpired);
                    _transport.Close(1000, "auth rejected");
                }
                else
                {
                    _transport.Close(4002, "auth failed");
                }
                return;
            }
            User = r.Data?["user"];
            _readySinceMs = _now;
            _nextBeatAtMs = _now + HeartbeatIntervalMs;
            _beatId = null;
            SetState(ConnectionState.Ready);
            if (_wasReadyBefore) Resynced?.Invoke();
            _wasReadyBefore = true;
        }

        private void SendHeartbeat()
        {
            _beatId = _newId();
            var beat = _beatId;
            _pending.Add(beat, "ping", _now, HeartbeatTimeoutMs, r =>
            {
                if (_beatId != beat) return;
                _beatId = null;
                if (r.Ok) { _nextBeatAtMs = _now + HeartbeatIntervalMs; return; }
                // Dead socket: drop it; OnClosed schedules the reconnect.
                if (State == ConnectionState.Ready && r.ErrorCode == RequestResult.Timeout) _transport.Close(4003, "heartbeat timeout");
            });
            _transport.Send(ClientMessage.Serialize("ping", beat, null));
        }

        private void OnMessage(string raw)
        {
            var msg = ServerMessage.TryParse(raw);
            if (msg == null) return;
            if (msg.Kind == ServerMessage.MessageKind.Response) { _pending.Resolve(msg); return; }
            if (State == ConnectionState.Ready)
            {
                try { EventReceived?.Invoke(msg.EventName, msg.Data); }
                catch (Exception) { /* a faulty handler must not break the connection */ }
            }
        }

        private void OnClosed(int code, string reason)
        {
            _beatId = null;
            _pending.FailAll(RequestResult.ConnectionLost);
            if (_expectClose || State == ConnectionState.Stopped || State == ConnectionState.SessionExpired) return;
            if (ReconnectPolicy.IsTerminal(code))
            {
                SetState(code == 4001 ? ConnectionState.SessionExpired : ConnectionState.Stopped);
                return;
            }
            _reconnectAtMs = _now + _policy.NextDelayMs();
            SetState(ConnectionState.WaitingToReconnect);
        }

        private void SetState(ConnectionState s)
        {
            if (State == s) return;
            State = s;
            StateChanged?.Invoke(s);
        }
    }

    /// <summary>Request ids: unique per process, 8–64 chars as the gateway requires.</summary>
    public static class RequestIds
    {
        private static long _counter;
        private static readonly string Prefix = Guid.NewGuid().ToString("N").Substring(0, 8);
        public static string Next() => Prefix + "-" + System.Threading.Interlocked.Increment(ref _counter).ToString("x");
    }
}
