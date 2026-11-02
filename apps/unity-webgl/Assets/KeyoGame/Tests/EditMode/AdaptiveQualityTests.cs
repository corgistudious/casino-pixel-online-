using KeyoGame.Quality;
using NUnit.Framework;

namespace KeyoGame.Tests
{
    public class AdaptiveQualityTests
    {
        private static long Run(AdaptiveQuality q, float frameMs, long fromMs, long durationMs)
        {
            long t = fromMs;
            while (t < fromMs + durationMs) { q.Frame(frameMs, t); t += (long)frameMs; }
            return t;
        }

        [Test]
        public void SlowFramesDowngradeOneTierAfterTheDelay()
        {
            var q = new AdaptiveQuality(QualityTier.High, QualityTier.High);
            int changes = 0;
            q.Changed += _ => changes++;
            long t = Run(q, 25f, 0, 2500); // 40 fps < 60 target (budget 16.7 ms × 1.25)
            Assert.AreEqual(QualityTier.High, q.Tier, "not before DownAfterMs");
            Run(q, 25f, t, 3000);
            Assert.AreEqual(QualityTier.Medium, q.Tier);
            Assert.AreEqual(1, changes);
        }

        [Test]
        public void CooldownPreventsFlickerAndUpgradesNeedALongStableWindow()
        {
            var q = new AdaptiveQuality(QualityTier.Medium, QualityTier.High);
            long t = Run(q, 8f, 0, 10000); // very fast frames
            Assert.AreEqual(QualityTier.Medium, q.Tier, "no upgrade before UpAfterMs");
            t = Run(q, 8f, t, 8000);
            Assert.AreEqual(QualityTier.High, q.Tier);
            // Immediately slow: cooldown blocks a change for 8 s even though frames are bad.
            long changedAt = t;
            t = Run(q, 40f, t, 5000);
            Assert.AreEqual(QualityTier.High, q.Tier, "cooldown");
            Run(q, 40f, t, 10000);
            Assert.AreEqual(QualityTier.Medium, q.Tier);
            Assert.Greater(t, changedAt);
        }

        [Test]
        public void NeverAboveTheCapabilityCeilingAndNeverBelowLow()
        {
            var q = new AdaptiveQuality(QualityTier.High, QualityTier.Medium);
            Assert.AreEqual(QualityTier.Medium, q.Tier, "initial clamped to ceiling");
            Run(q, 5f, 0, 60000);
            Assert.AreEqual(QualityTier.Medium, q.Tier);
            var low = new AdaptiveQuality(QualityTier.Low, QualityTier.High);
            Run(low, 200f, 0, 60000);
            Assert.AreEqual(QualityTier.Low, low.Tier);
        }

        [Test]
        public void BackgroundGapsAreIgnoredAndManualModesPin()
        {
            var q = new AdaptiveQuality(QualityTier.High, QualityTier.High);
            for (int i = 0; i < 200; i++) q.Frame(i % 50 == 0 ? 5000f : 16f, i * 16);
            Assert.AreEqual(QualityTier.High, q.Tier, "a 5 s gap (background) is not a slow frame");
            q.SetMode(QualityMode.Low, 0);
            Assert.AreEqual(QualityTier.Low, q.Tier);
            Run(q, 5f, 0, 60000);
            Assert.AreEqual(QualityTier.Low, q.Tier, "manual mode is not changed by AUTO");
            Assert.AreEqual(30, q.Settings.TargetFps);
            Assert.AreEqual(1f, q.Settings.DprCap);
        }
    }
}
