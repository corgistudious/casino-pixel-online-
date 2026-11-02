using System.Runtime.InteropServices;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace KeyoGame.WebGL
{
    /// <summary>What the host page (WebGL template, opened by React) tells Unity at start-up.</summary>
    public sealed class HostContext
    {
        public string WsUrl = "ws://localhost:3000/ws";
        public string Locale = "vi";
        public string Game = "taixiu";
        public string TableId = "";
        public string Tier = "medium";
        public string Ceiling = "high";

        public static HostContext From(string json)
        {
            var c = new HostContext();
            JObject o;
            try { o = JObject.Parse(string.IsNullOrEmpty(json) ? "{}" : json); }
            catch { return c; }
            c.WsUrl = (string)o["wsUrl"] ?? c.WsUrl;
            c.Locale = (string)o["locale"] ?? c.Locale;
            c.Game = (string)o["game"] ?? c.Game;
            c.TableId = (string)o["tableId"] ?? c.TableId;
            c.Tier = (string)o["tier"] ?? c.Tier;
            c.Ceiling = (string)o["ceiling"] ?? c.Ceiling;
            return c;
        }
    }

    /// <summary>
    /// Unity ↔ host page. WebGL uses KeyoBridge.jslib; the Editor reads environment variables
    /// (KEYO_WS_URL, KEYO_TOKEN, KEYO_TABLE) so the table can be tried against a local server.
    /// Never carries a password or a server secret.
    /// </summary>
    public static class HostBridge
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] private static extern string KeyoBridge_GetToken();
        [DllImport("__Internal")] private static extern string KeyoBridge_GetContext();
        [DllImport("__Internal")] private static extern void KeyoBridge_Post(string json);
        [DllImport("__Internal")] private static extern void KeyoBridge_SetDprCap(float cap);

        public static string GetToken() => KeyoBridge_GetToken();
        public static HostContext GetContext() => HostContext.From(KeyoBridge_GetContext());
        public static void Post(JObject msg) => KeyoBridge_Post(msg.ToString(Newtonsoft.Json.Formatting.None));
        public static void SetDprCap(float cap) => KeyoBridge_SetDprCap(cap);
#else
        public static string GetToken() => System.Environment.GetEnvironmentVariable("KEYO_TOKEN");
        public static HostContext GetContext()
        {
            var c = new HostContext();
            c.WsUrl = System.Environment.GetEnvironmentVariable("KEYO_WS_URL") ?? c.WsUrl;
            c.TableId = System.Environment.GetEnvironmentVariable("KEYO_TABLE") ?? c.TableId;
            return c;
        }
        public static void Post(JObject msg) => Debug.Log("[KeyoHost] " + msg.ToString(Newtonsoft.Json.Formatting.None));
        public static void SetDprCap(float cap) { }
#endif
    }
}
