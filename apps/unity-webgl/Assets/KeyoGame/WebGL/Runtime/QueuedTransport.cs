using System;
using System.Collections.Concurrent;
using KeyoGame.Net;

namespace KeyoGame.WebGL
{
    /// <summary>
    /// Base for transports: socket callbacks may arrive outside the frame (browser events, a receive
    /// thread in the Editor). They are queued and delivered from <see cref="Pump"/> in Update, so the
    /// core always runs on the main thread, in order.
    /// </summary>
    public abstract class QueuedTransport : ITransport
    {
        public event Action Opened;
        public event Action<string> MessageReceived;
        public event Action<int, string> Closed;

        private readonly ConcurrentQueue<Action> _inbox = new ConcurrentQueue<Action>();

        public abstract void Open(string url);
        public abstract void Send(string text);
        public abstract void Close(int code, string reason);

        protected void EnqueueOpen() => _inbox.Enqueue(() => Opened?.Invoke());
        protected void EnqueueMessage(string m) => _inbox.Enqueue(() => MessageReceived?.Invoke(m));
        protected void EnqueueClose(int code, string reason) => _inbox.Enqueue(() => Closed?.Invoke(code, reason));

        /// <summary>Delivers queued callbacks. Bounded per frame so a burst cannot stall a frame.</summary>
        public void Pump(int max = 256)
        {
            for (int i = 0; i < max && _inbox.TryDequeue(out var a); i++) a();
        }
    }
}
