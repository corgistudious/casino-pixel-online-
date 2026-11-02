using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace KeyoGame.UI
{
    /// <summary>
    /// Minimal uGUI construction helpers (milestone 1, no art yet). Landscape-first: the canvas scales
    /// a 1280×720 design by height, so phones and PCs keep proportions. Final HD art replaces these
    /// visuals in the design-system milestone without touching game logic.
    /// </summary>
    public static class KeyoUi
    {
        public static readonly Color Ink = new Color(0.04f, 0.03f, 0.09f, 1f);
        public static readonly Color Panel = new Color(0.08f, 0.06f, 0.16f, 0.92f);
        public static readonly Color Gold = new Color(0.95f, 0.76f, 0.31f, 1f);
        public static readonly Color Cyan = new Color(0.35f, 0.85f, 1f, 1f);
        public static readonly Color Muted = new Color(1f, 1f, 1f, 0.6f);

        private static Font _font;
        public static Font Font => _font != null ? _font : (_font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"));

        public static Canvas CreateCanvas(string name)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1280, 720);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 1f;
            go.AddComponent<GraphicRaycaster>();
            if (UnityEngine.Object.FindFirstObjectByType<EventSystem>() == null)
                new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            return canvas;
        }

        public static RectTransform Rect(string name, Transform parent, Vector2 anchorMin, Vector2 anchorMax, Vector2 offsetMin = default, Vector2 offsetMax = default)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var rt = (RectTransform)go.transform;
            rt.SetParent(parent, false);
            rt.anchorMin = anchorMin;
            rt.anchorMax = anchorMax;
            rt.offsetMin = offsetMin;
            rt.offsetMax = offsetMax;
            return rt;
        }

        public static Image Fill(RectTransform rt, Color c)
        {
            var img = rt.gameObject.AddComponent<Image>();
            img.color = c;
            img.raycastTarget = false;
            return img;
        }

        public static Text Label(RectTransform parent, string name, int size, Color color, TextAnchor anchor = TextAnchor.MiddleCenter)
        {
            var rt = Rect(name, parent, Vector2.zero, Vector2.one);
            var t = rt.gameObject.AddComponent<Text>();
            t.font = Font;
            t.fontSize = size;
            t.color = color;
            t.alignment = anchor;
            t.raycastTarget = false;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Truncate;
            return t;
        }

        public static Button Button(RectTransform parent, string name, Color bg, Action onClick, out Text label, int fontSize = 26)
        {
            var img = Fill(parent, bg);
            img.raycastTarget = true;
            var b = parent.gameObject.AddComponent<Button>();
            b.targetGraphic = img;
            b.onClick.AddListener(() => onClick());
            label = Label(parent, name + "Label", fontSize, Color.white);
            return b;
        }
    }

    /// <summary>Keeps its rect inside the device safe area (notch / Dynamic Island / home indicator).</summary>
    public sealed class SafeAreaFitter : MonoBehaviour
    {
        private Rect _last;

        private void OnEnable()
        {
            Apply();
            if (Bootstrap.KeyoApp.Instance != null) Bootstrap.KeyoApp.Instance.ViewportChanged += Apply;
        }

        private void OnDisable()
        {
            if (Bootstrap.KeyoApp.Instance != null) Bootstrap.KeyoApp.Instance.ViewportChanged -= Apply;
        }

        private void Apply()
        {
            var safe = Screen.safeArea;
            var app = Bootstrap.KeyoApp.Instance;
            if (app != null && (app.SafeInsets.x > 0 || app.SafeInsets.y > 0 || app.SafeInsets.width > 0 || app.SafeInsets.height > 0))
            {
                // Insets arrive in CSS px; the canvas render buffer is CSS px × ratio (DPR cap of the quality tier).
                float k = Mathf.Max(1f, app.RenderRatio);
                var i = app.SafeInsets;
                safe = new Rect(i.x * k, i.y * k, Screen.width - (i.x + i.width) * k, Screen.height - (i.y + i.height) * k);
            }
            if (safe == _last) return;
            _last = safe;
            var rt = (RectTransform)transform;
            rt.anchorMin = new Vector2(safe.xMin / Mathf.Max(1, Screen.width), safe.yMin / Mathf.Max(1, Screen.height));
            rt.anchorMax = new Vector2(safe.xMax / Mathf.Max(1, Screen.width), safe.yMax / Mathf.Max(1, Screen.height));
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
        }
    }
}
