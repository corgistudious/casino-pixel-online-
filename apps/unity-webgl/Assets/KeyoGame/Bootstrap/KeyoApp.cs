using System;
using KeyoGame.Localization;
using KeyoGame.Net;
using KeyoGame.Quality;
using KeyoGame.WebGL;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace KeyoGame.Bootstrap
{
    /// <summary>
    /// The one persistent object of the Unity frontend: owns the single gateway connection, the
    /// localizer, adaptive quality and the viewport state, and opens the requested game.
    /// The host page calls <see cref="OnViewport"/> (verified sizes from keyoViewport.js) and
    /// <see cref="OnHostMessage"/> (locale / quality / audio from React) via unityInstance.SendMessage.
    /// One connection only: game controllers share it, nothing opens a second socket.
    /// </summary>
    public sealed class KeyoApp : MonoBehaviour
    {
        public static KeyoApp Instance { get; private set; }

        public KeyoConnection Connection { get; private set; }
        public Localizer L { get; private set; }
        public AdaptiveQuality Quality { get; private set; }
        public HostContext Context { get; private set; }
        public Rect SafeInsets { get; private set; } // CSS px: x=left, y=bottom, width=right, height=top
        /// <summary>Render buffer px per CSS px (from the host page; DPR capped by the quality tier).</summary>
        public float RenderRatio { get; private set; } = 1f;
        public event Action ViewportChanged;
        public event Action LocaleChanged;

        private QueuedTransport _transport;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Boot()
        {
            if (Instance != null) return;
            var go = new GameObject("KeyoApp");
            DontDestroyOnLoad(go);
            go.AddComponent<KeyoApp>();
        }

        public static long NowMs() => (long)(Time.realtimeSinceStartupAsDouble * 1000.0);

        private void Awake()
        {
            Instance = this;
            Context = HostBridge.GetContext();
            var i18n = Resources.Load<TextAsset>("keyo-i18n");
            L = Localizer.FromJson(i18n != null ? i18n.text : "{\"vi\":{},\"en\":{}}");
            L.SetLocale(Context.Locale);

            Quality = new AdaptiveQuality(ParseTier(Context.Tier, QualityTier.Medium), ParseTier(Context.Ceiling, QualityTier.High));
            Quality.Changed += _ => ApplyQuality();
            ApplyQuality();

#if UNITY_WEBGL && !UNITY_EDITOR
            _transport = new JsWebSocketTransport();
#else
            _transport = new DotNetWebSocketTransport();
#endif
            Connection = new KeyoConnection(_transport, HostBridge.GetToken);
            Connection.StateChanged += s =>
            {
                HostBridge.Post(new JObject { ["type"] = "connection", ["state"] = s.ToString() });
                if (s == ConnectionState.SessionExpired) HostBridge.Post(new JObject { ["type"] = "session-expired" });
            };
            Connection.Start(Context.WsUrl, NowMs());
            OpenGame();
            HostBridge.Post(new JObject { ["type"] = "ready", ["game"] = Context.Game });
        }

        private void OpenGame()
        {
            switch (Context.Game)
            {
                case "taixiu":
                    new GameObject("TaiXiuTable").AddComponent<Games.SicBo.TaiXiuTableController>().Init(Context.TableId);
                    break;
                default:
                    Debug.LogWarning("[Keyo] game not migrated yet: " + Context.Game);
                    HostBridge.Post(new JObject { ["type"] = "unsupported-game", ["game"] = Context.Game });
                    break;
            }
        }

        private void Update()
        {
            long now = NowMs();
            _transport?.Pump();
            Connection?.Tick(now);
            Quality?.Frame(Time.unscaledDeltaTime * 1000f, now);
        }

        private void OnApplicationFocus(bool focus)
        {
            if (focus) Connection?.OnForeground();
        }

        private void OnApplicationPause(bool paused)
        {
            Quality?.ResetWindow();
            if (!paused) Connection?.OnForeground();
        }

        private void OnDestroy()
        {
            Connection?.Stop();
            if (Instance == this) Instance = null;
        }

        /// <summary>From keyoViewport.js: {w, h, ratio, safe:{t,r,b,l}, reason}. Only verified, settled sizes arrive here.</summary>
        public void OnViewport(string json)
        {
            try
            {
                var o = JObject.Parse(json);
                var s = o["safe"];
                RenderRatio = o.Value<float?>("ratio") ?? RenderRatio;
                SafeInsets = new Rect(s?.Value<float?>("l") ?? 0, s?.Value<float?>("b") ?? 0, s?.Value<float?>("r") ?? 0, s?.Value<float?>("t") ?? 0);
                Connection?.OnForeground(); // a viewport change often means resume / rotation: probe the socket
                ViewportChanged?.Invoke();
            }
            catch (Exception e) { Debug.LogWarning("[Keyo] bad viewport message: " + e.Message); }
        }

        /// <summary>From React: {type:'locale', locale} | {type:'quality', mode} | {type:'foreground'}.</summary>
        public void OnHostMessage(string json)
        {
            JObject o;
            try { o = JObject.Parse(json); } catch { return; }
            switch ((string)o["type"])
            {
                case "locale":
                    L.SetLocale((string)o["locale"]);
                    LocaleChanged?.Invoke();
                    break;
                case "quality":
                    if (Enum.TryParse((string)o["mode"], true, out QualityMode m)) Quality.SetMode(m, NowMs());
                    break;
                case "foreground":
                    Connection?.OnForeground();
                    break;
            }
        }

        private void ApplyQuality()
        {
            var t = Quality.Settings;
            Application.targetFrameRate = t.TargetFps;
            HostBridge.SetDprCap(t.DprCap);
        }

        private static QualityTier ParseTier(string s, QualityTier fallback) => Enum.TryParse(s, true, out QualityTier t) ? t : fallback;
    }
}
