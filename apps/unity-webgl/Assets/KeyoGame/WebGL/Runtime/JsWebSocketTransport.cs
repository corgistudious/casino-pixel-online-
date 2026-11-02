#if UNITY_WEBGL && !UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using AOT;

namespace KeyoGame.WebGL
{
    /// <summary>Browser WebSocket via KeyoBridge.jslib (WebGL player only).</summary>
    public sealed class JsWebSocketTransport : QueuedTransport
    {
        private delegate void IdCallback(int id);
        private delegate void MessageCallback(int id, IntPtr text);
        private delegate void CloseCallback(int id, int code);

        [DllImport("__Internal")] private static extern void KeyoWs_SetCallbacks(IdCallback onOpen, MessageCallback onMessage, CloseCallback onClose);
        [DllImport("__Internal")] private static extern int KeyoWs_Open(string url);
        [DllImport("__Internal")] private static extern void KeyoWs_Send(int id, string text);
        [DllImport("__Internal")] private static extern void KeyoWs_Close(int id, int code, string reason);

        private static readonly Dictionary<int, JsWebSocketTransport> Live = new Dictionary<int, JsWebSocketTransport>();
        private static bool _registered;
        private int _id;

        public override void Open(string url)
        {
            if (!_registered) { KeyoWs_SetCallbacks(OnOpen, OnMessage, OnClose); _registered = true; }
            if (_id != 0) { KeyoWs_Close(_id, 1000, "reopen"); Live.Remove(_id); }
            _id = KeyoWs_Open(url);
            Live[_id] = this;
        }

        public override void Send(string text) { if (_id != 0) KeyoWs_Send(_id, text); }

        public override void Close(int code, string reason) { if (_id != 0) KeyoWs_Close(_id, code, reason ?? ""); }

        [MonoPInvokeCallback(typeof(IdCallback))]
        private static void OnOpen(int id) { if (Live.TryGetValue(id, out var t)) t.EnqueueOpen(); }

        [MonoPInvokeCallback(typeof(MessageCallback))]
        private static void OnMessage(int id, IntPtr text)
        {
            if (Live.TryGetValue(id, out var t)) t.EnqueueMessage(Marshal.PtrToStringUTF8(text));
        }

        [MonoPInvokeCallback(typeof(CloseCallback))]
        private static void OnClose(int id, int code)
        {
            if (!Live.TryGetValue(id, out var t)) return;
            Live.Remove(id);
            if (t._id == id) t._id = 0;
            t.EnqueueClose(code, "");
        }
    }
}
#endif
