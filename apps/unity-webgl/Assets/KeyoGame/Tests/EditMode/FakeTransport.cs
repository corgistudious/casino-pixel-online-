using System;
using System.Collections.Generic;
using KeyoGame.Net;
using Newtonsoft.Json.Linq;

namespace KeyoGame.Tests
{
    /// <summary>In-memory WebSocket: records frames, lets tests open/answer/close.</summary>
    public sealed class FakeTransport : ITransport
    {
        public event Action Opened;
        public event Action<string> MessageReceived;
        public event Action<int, string> Closed;

        public readonly List<JObject> Sent = new List<JObject>();
        public int OpenCount;
        public bool IsOpen;

        public void Open(string url) { OpenCount++; }
        public void Send(string text) { Sent.Add(JObject.Parse(text)); }
        public void Close(int code, string reason) { if (IsOpen) { IsOpen = false; Closed?.Invoke(code, reason); } }

        public void ServerOpen() { IsOpen = true; Opened?.Invoke(); }
        public void ServerClose(int code) { IsOpen = false; Closed?.Invoke(code, ""); }
        public void ServerSend(object frame) => MessageReceived?.Invoke(JObject.FromObject(frame).ToString());
        public JObject Last(string type) { for (int i = Sent.Count - 1; i >= 0; i--) if ((string)Sent[i]["type"] == type) return Sent[i]; return null; }
        public int CountOf(string type) { int n = 0; foreach (var s in Sent) if ((string)s["type"] == type) n++; return n; }
        public void Answer(JObject req, object data) => ServerSend(new { type = "res", id = (string)req["id"], ok = true, data });
        public void Reject(JObject req, string code) => ServerSend(new { type = "res", id = (string)req["id"], ok = false, error = new { code } });
    }
}
