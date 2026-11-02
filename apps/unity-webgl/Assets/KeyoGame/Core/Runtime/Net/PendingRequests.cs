using System;
using System.Collections.Generic;
using KeyoGame.Protocol;

namespace KeyoGame.Net
{
    /// <summary>Result of one request: either data or an error code (server code, or a client code below).</summary>
    public sealed class RequestResult
    {
        /// <summary>The socket closed before the answer arrived: the server may or may NOT have applied it.</summary>
        public const string ConnectionLost = "connection_lost";
        /// <summary>No answer in time: the server may or may NOT have applied it.</summary>
        public const string Timeout = "timeout";
        /// <summary>Not sent at all (not connected / not authenticated): nothing happened server-side.</summary>
        public const string NotConnected = "not_connected";

        public bool Ok { get; private set; }
        public Newtonsoft.Json.Linq.JToken Data { get; private set; }
        public string ErrorCode { get; private set; }

        /// <summary>True when the outcome on the server is unknown (must resync, never blindly resend).</summary>
        public bool OutcomeUnknown => !Ok && (ErrorCode == ConnectionLost || ErrorCode == Timeout);

        public static RequestResult Success(Newtonsoft.Json.Linq.JToken data) => new RequestResult { Ok = true, Data = data };
        public static RequestResult Fail(string code) => new RequestResult { Ok = false, ErrorCode = code };
    }

    /// <summary>
    /// Tracks in-flight requests by id. It NEVER resends anything: a lost or timed-out request is
    /// reported to its caller with <see cref="RequestResult.OutcomeUnknown"/>, and game code resyncs from
    /// the server (e.g. table.join returns myBets) instead of re-sending a bet. Gateway processes one
    /// message at a time per socket, so answers arrive in order, but this does not rely on it.
    /// </summary>
    public sealed class PendingRequests
    {
        private sealed class Entry
        {
            public string Type;
            public long DeadlineMs;
            public Action<RequestResult> Callback;
        }

        private readonly Dictionary<string, Entry> _byId = new Dictionary<string, Entry>();

        public int Count => _byId.Count;

        public void Add(string id, string type, long nowMs, int timeoutMs, Action<RequestResult> callback)
        {
            if (_byId.ContainsKey(id)) throw new InvalidOperationException("duplicate request id " + id);
            _byId[id] = new Entry { Type = type, DeadlineMs = nowMs + timeoutMs, Callback = callback };
        }

        /// <summary>Completes the matching request. Unknown ids (late answers after a timeout) are ignored.</summary>
        public bool Resolve(ServerMessage msg)
        {
            if (msg == null || msg.Kind != ServerMessage.MessageKind.Response) return false;
            if (!_byId.TryGetValue(msg.Id, out var e)) return false;
            _byId.Remove(msg.Id);
            Invoke(e, msg.Ok ? RequestResult.Success(msg.Data) : RequestResult.Fail(msg.ErrorCode));
            return true;
        }

        /// <summary>Fails requests past their deadline. Returns how many timed out.</summary>
        public int Tick(long nowMs)
        {
            if (_byId.Count == 0) return 0;
            var expired = new List<string>();
            foreach (var kv in _byId) if (kv.Value.DeadlineMs <= nowMs) expired.Add(kv.Key);
            foreach (var id in expired)
            {
                var e = _byId[id];
                _byId.Remove(id);
                Invoke(e, RequestResult.Fail(RequestResult.Timeout));
            }
            return expired.Count;
        }

        /// <summary>The socket went away: every in-flight request ends with <paramref name="code"/>.</summary>
        public void FailAll(string code)
        {
            if (_byId.Count == 0) return;
            var all = new List<Entry>(_byId.Values);
            _byId.Clear();
            foreach (var e in all) Invoke(e, RequestResult.Fail(code));
        }

        private static void Invoke(Entry e, RequestResult r)
        {
            try { e.Callback?.Invoke(r); }
            catch (Exception) { /* a faulty callback must not break the connection loop */ }
        }
    }
}
