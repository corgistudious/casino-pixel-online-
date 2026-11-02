using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace KeyoGame.Localization
{
    /// <summary>
    /// VI/EN strings from the SAME source as the React app (packages/shared/src/i18n, exported to
    /// keyo-i18n.json by tools/export-i18n.mjs). Keys are the i18next paths ("games.taixiu.big"),
    /// with {{name}} interpolation. Missing keys fall back to English, then to the key itself, so a
    /// missing translation is visible but never crashes. No UI text is hardcoded in C#.
    /// </summary>
    public sealed class Localizer
    {
        private readonly Dictionary<string, Dictionary<string, string>> _byLocale = new Dictionary<string, Dictionary<string, string>>();
        public string Locale { get; private set; } = "vi";

        public static Localizer FromJson(string json)
        {
            var l = new Localizer();
            var root = JObject.Parse(json);
            foreach (var prop in root.Properties())
            {
                var flat = new Dictionary<string, string>();
                Flatten(prop.Value, "", flat);
                l._byLocale[prop.Name] = flat;
            }
            return l;
        }

        public bool Has(string locale) => _byLocale.ContainsKey(locale);

        public void SetLocale(string locale)
        {
            if (Has(locale)) Locale = locale;
        }

        public string Get(string key, IDictionary<string, object> args = null)
        {
            string s = Lookup(Locale, key) ?? Lookup("en", key) ?? key;
            if (args != null)
                foreach (var kv in args) s = s.Replace("{{" + kv.Key + "}}", System.Convert.ToString(kv.Value, System.Globalization.CultureInfo.InvariantCulture));
            return s;
        }

        /// <summary>The current locale's string only (no fallback); null when missing. For coverage checks.</summary>
        public string GetStrict(string key) => Lookup(Locale, key);

        private string Lookup(string locale, string key) => _byLocale.TryGetValue(locale, out var d) && d.TryGetValue(key, out var v) ? v : null;

        private static void Flatten(JToken t, string prefix, Dictionary<string, string> into)
        {
            if (t is JObject o)
            {
                foreach (var p in o.Properties()) Flatten(p.Value, prefix.Length == 0 ? p.Name : prefix + "." + p.Name, into);
            }
            else if (t.Type == JTokenType.String) into[prefix] = (string)t;
        }
    }
}
