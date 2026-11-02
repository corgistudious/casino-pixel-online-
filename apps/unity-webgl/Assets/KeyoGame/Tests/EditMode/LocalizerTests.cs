using System.Collections.Generic;
using KeyoGame.Localization;
using NUnit.Framework;

namespace KeyoGame.Tests
{
    public class LocalizerTests
    {
        private const string Json = "{\"vi\":{\"games\":{\"taixiu\":{\"big\":\"Tài\"}},\"greet\":\"Chào {{name}}\"},\"en\":{\"games\":{\"taixiu\":{\"big\":\"Big\",\"small\":\"Small\"}},\"greet\":\"Hi {{name}}\"}}";

        [Test]
        public void LooksUpNestedKeysPerLocaleWithFallbacks()
        {
            var l = Localizer.FromJson(Json);
            Assert.AreEqual("Tài", l.Get("games.taixiu.big"));
            Assert.AreEqual("Small", l.Get("games.taixiu.small"), "missing VI falls back to EN");
            Assert.AreEqual("no.such.key", l.Get("no.such.key"), "missing everywhere shows the key, never throws");
            l.SetLocale("en");
            Assert.AreEqual("Big", l.Get("games.taixiu.big"));
            l.SetLocale("fr");
            Assert.AreEqual("en", l.Locale, "unknown locales are ignored");
            Assert.AreEqual("Hi Keyo", l.Get("greet", new Dictionary<string, object> { ["name"] = "Keyo" }));
        }
    }
}
