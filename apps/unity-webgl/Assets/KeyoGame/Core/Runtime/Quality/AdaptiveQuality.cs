using System;

namespace KeyoGame.Quality
{
    public enum QualityTier { Low = 0, Medium = 1, High = 2 }
    public enum QualityMode { Auto, Low, Medium, High }

    /// <summary>What a tier means for rendering (applied by the Unity side).</summary>
    public struct TierSettings
    {
        public int TargetFps;
        /// <summary>Device-pixel-ratio cap for the canvas render buffer (render resolution scaling).</summary>
        public float DprCap;
        /// <summary>0 = essential animations only, 1 = standard, 2 = full (glows, particles).</summary>
        public int Effects;

        public static TierSettings For(QualityTier t)
        {
            switch (t)
            {
                case QualityTier.Low: return new TierSettings { TargetFps = 30, DprCap = 1f, Effects = 0 };
                case QualityTier.Medium: return new TierSettings { TargetFps = 60, DprCap = 1.5f, Effects = 1 };
                default: return new TierSettings { TargetFps = 60, DprCap = 2f, Effects = 2 };
            }
        }
    }

    /// <summary>
    /// AUTO quality from MEASURED frame times (the initial tier comes from capabilities, never from the
    /// user agent alone). Hysteresis so it never oscillates:
    /// - down one tier when the 90th-percentile frame time stays over budget × 1.25 for DownAfterMs;
    /// - up one tier only after UpAfterMs with p90 under budget × 0.7, never above the capability ceiling;
    /// - no change during CooldownMs after any change (no flicker); background frames are ignored.
    /// Manual modes pin the tier.
    /// </summary>
    public sealed class AdaptiveQuality
    {
        public int DownAfterMs { get; set; } = 3000;
        public int UpAfterMs { get; set; } = 15000;
        public int CooldownMs { get; set; } = 8000;
        public const int Window = 60;

        public QualityMode Mode { get; private set; } = QualityMode.Auto;
        public QualityTier Tier { get; private set; }
        public QualityTier Ceiling { get; private set; }
        public event Action<QualityTier> Changed;

        private readonly float[] _ring = new float[Window];
        private readonly float[] _sorted = new float[Window];
        private int _count;
        private int _next;
        private long _overSince = -1;
        private long _underSince = -1;
        private long _lastChange = long.MinValue / 2;

        public AdaptiveQuality(QualityTier initial, QualityTier ceiling)
        {
            Ceiling = ceiling;
            Tier = initial > ceiling ? ceiling : initial;
        }

        public TierSettings Settings => TierSettings.For(Tier);

        public void SetMode(QualityMode mode, long nowMs)
        {
            Mode = mode;
            ResetWindow();
            if (mode == QualityMode.Auto) return;
            Apply((QualityTier)((int)mode - 1), nowMs);
        }

        /// <summary>One rendered frame. <paramref name="frameMs"/> is the unscaled frame time.</summary>
        public void Frame(float frameMs, long nowMs)
        {
            if (Mode != QualityMode.Auto) return;
            if (frameMs <= 0 || frameMs > 1000) { ResetWindow(); return; } // paused / background / tab switch
            _ring[_next] = frameMs;
            _next = (_next + 1) % Window;
            if (_count < Window) { _count++; return; }
            if (nowMs - _lastChange < CooldownMs) return;

            float p90 = Percentile90();
            float budget = 1000f / Settings.TargetFps;
            if (p90 > budget * 1.25f)
            {
                _underSince = -1;
                if (_overSince < 0) _overSince = nowMs;
                if (nowMs - _overSince >= DownAfterMs && Tier > QualityTier.Low) Apply(Tier - 1, nowMs);
            }
            else if (p90 < budget * 0.7f && Tier < Ceiling)
            {
                _overSince = -1;
                if (_underSince < 0) _underSince = nowMs;
                if (nowMs - _underSince >= UpAfterMs) Apply(Tier + 1, nowMs);
            }
            else
            {
                _overSince = -1;
                _underSince = -1;
            }
        }

        public void ResetWindow()
        {
            _count = 0;
            _next = 0;
            _overSince = -1;
            _underSince = -1;
        }

        private float Percentile90()
        {
            Array.Copy(_ring, _sorted, Window);
            Array.Sort(_sorted);
            return _sorted[(int)(Window * 0.9f)];
        }

        private void Apply(QualityTier t, long nowMs)
        {
            if (t > Ceiling && Mode == QualityMode.Auto) t = Ceiling;
            if (t == Tier) return;
            Tier = t;
            _lastChange = nowMs;
            ResetWindow();
            Changed?.Invoke(t);
        }
    }
}
