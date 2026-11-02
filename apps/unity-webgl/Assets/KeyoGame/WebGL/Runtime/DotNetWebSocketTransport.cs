#if !UNITY_WEBGL || UNITY_EDITOR
using System;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace KeyoGame.WebGL
{
    /// <summary>
    /// Editor / standalone WebSocket (System.Net.WebSockets). Not used in WebGL builds.
    /// Each Open() creates a session that reports Closed exactly once, whoever closes first.
    /// </summary>
    public sealed class DotNetWebSocketTransport : QueuedTransport
    {
        private sealed class Session
        {
            public readonly ClientWebSocket Ws = new ClientWebSocket();
            public readonly CancellationTokenSource Cts = new CancellationTokenSource();
            public Task SendChain = Task.CompletedTask;
            public int Closed;
        }

        private Session _s;

        public override void Open(string url)
        {
            if (_s != null) Finish(_s, 1000, "reopen", raise: false);
            var s = _s = new Session();
            _ = Task.Run(async () =>
            {
                try
                {
                    await s.Ws.ConnectAsync(new Uri(url), s.Cts.Token);
                    EnqueueOpen();
                    var buf = new byte[64 * 1024];
                    var sb = new StringBuilder();
                    while (s.Ws.State == WebSocketState.Open)
                    {
                        var r = await s.Ws.ReceiveAsync(new ArraySegment<byte>(buf), s.Cts.Token);
                        if (r.MessageType == WebSocketMessageType.Close) { Finish(s, (int?)s.Ws.CloseStatus ?? 1000, s.Ws.CloseStatusDescription ?? "", raise: true); return; }
                        sb.Append(Encoding.UTF8.GetString(buf, 0, r.Count));
                        if (r.EndOfMessage) { EnqueueMessage(sb.ToString()); sb.Clear(); }
                    }
                    Finish(s, 1006, "closed", raise: true);
                }
                catch (Exception) { Finish(s, 1006, "error", raise: true); }
            });
        }

        public override void Send(string text)
        {
            var s = _s;
            if (s == null || s.Ws.State != WebSocketState.Open) return;
            var bytes = Encoding.UTF8.GetBytes(text);
            lock (s) s.SendChain = s.SendChain.ContinueWith(_ => s.Ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None)).Unwrap();
        }

        public override void Close(int code, string reason)
        {
            var s = _s;
            if (s != null) Finish(s, code, reason ?? "", raise: true);
        }

        private void Finish(Session s, int code, string reason, bool raise)
        {
            if (Interlocked.Exchange(ref s.Closed, 1) == 1) return;
            if (_s == s) _s = null;
            try { s.Cts.Cancel(); } catch (Exception) { }
            _ = Task.Run(async () =>
            {
                try { if (s.Ws.State == WebSocketState.Open) await s.Ws.CloseAsync((WebSocketCloseStatus)code, reason, CancellationToken.None); } catch (Exception) { }
                s.Ws.Dispose();
            });
            if (raise) EnqueueClose(code, reason);
        }
    }
}
#endif
