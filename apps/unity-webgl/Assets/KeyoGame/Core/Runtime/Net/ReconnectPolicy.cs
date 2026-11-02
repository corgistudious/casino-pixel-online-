using System;

namespace KeyoGame.Net
{
    /// <summary>
    /// Exponential back-off with jitter. Codes that mean "do not come back" stop it:
    /// 4001 (session expired / banned / auth timeout) needs a new sign-in, 4000 means this client sent
    /// an invalid frame (a bug) and retrying would loop.
    /// </summary>
    public sealed class ReconnectPolicy
    {
        public int BaseDelayMs { get; set; } = 500;
        public int MaxDelayMs { get; set; } = 15000;
        /// <summary>A connection that stayed ready this long resets the back-off.</summary>
        public int StableAfterMs { get; set; } = 30000;

        private readonly Func<double> _random;
        private int _attempt;

        public ReconnectPolicy(Func<double> random = null)
        {
            var rng = new Random();
            _random = random ?? (() => rng.NextDouble());
        }

        public int Attempt => _attempt;

        public static bool IsTerminal(int closeCode) => closeCode == 4001 || closeCode == 4000;

        /// <summary>Delay before the next attempt: base·2^n capped, with ±25 % jitter so clients do not reconnect in lockstep.</summary>
        public int NextDelayMs()
        {
            double raw = BaseDelayMs * Math.Pow(2, Math.Min(_attempt, 16));
            double capped = Math.Min(MaxDelayMs, raw);
            _attempt++;
            double jitter = 0.75 + _random() * 0.5;
            return (int)Math.Max(0, Math.Min(MaxDelayMs, capped * jitter));
        }

        public void Reset() => _attempt = 0;
    }
}
