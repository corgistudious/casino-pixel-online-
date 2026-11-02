using System;

namespace KeyoGame.Net
{
    /// <summary>
    /// A WebSocket. WebGL: a jslib-backed implementation; Editor: System.Net.WebSockets; tests: a fake.
    /// Callbacks must be delivered on the main thread (the Unity side queues them into Update).
    /// </summary>
    public interface ITransport
    {
        event Action Opened;
        event Action<string> MessageReceived;
        /// <summary>Close code (1000 normal, 1006 abnormal, 4001 auth/ban, 4000 bad frame) and reason.</summary>
        event Action<int, string> Closed;

        void Open(string url);
        void Send(string text);
        void Close(int code, string reason);
    }
}
