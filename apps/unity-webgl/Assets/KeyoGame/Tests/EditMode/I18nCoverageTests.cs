using System.IO;
using KeyoGame.Games.Tables;
using KeyoGame.Localization;
using NUnit.Framework;

namespace KeyoGame.Tests
{
    /// <summary>Every key the Unity code uses exists in VI and EN of the real export (no raw keys on screen).</summary>
    public class I18nCoverageTests
    {
        private static Localizer Load()
        {
            var dir = new DirectoryInfo(TestContext.CurrentContext.TestDirectory);
            for (; dir != null; dir = dir.Parent)
            {
                var p = Path.Combine(dir.FullName, "apps", "unity-webgl", "Assets", "KeyoGame", "Localization", "Resources", "keyo-i18n.json");
                if (File.Exists(p)) return Localizer.FromJson(File.ReadAllText(p));
                var q = Path.Combine(dir.FullName, "Assets", "KeyoGame", "Localization", "Resources", "keyo-i18n.json");
                if (File.Exists(q)) return Localizer.FromJson(File.ReadAllText(q));
            }
            Assert.Ignore("keyo-i18n.json not found");
            return null;
        }

        [Test]
        public void AllUnityKeysExistInBothLocales()
        {
            var l = Load();
            var keys = new System.Collections.Generic.List<string>(KeyoKeys.Static);
            foreach (var p in TableState.PhaseOrder) keys.Add(KeyoKeys.Phase(p));
            foreach (var k in TaiXiuRules.BetKinds) keys.Add(KeyoKeys.TaiXiuBet(k));
            foreach (var code in new[] { "internal", "rate_limited", "insufficient_funds", "invalid_bet", "bet_too_low", "unauthorized" }) keys.Add(KeyoKeys.Error(code));
            foreach (var locale in new[] { "vi", "en" })
            {
                l.SetLocale(locale);
                foreach (var key in keys)
                {
                    var v = l.GetStrict(key);
                    Assert.IsNotNull(v, locale + ": missing " + key);
                }
            }
        }
    }
}
