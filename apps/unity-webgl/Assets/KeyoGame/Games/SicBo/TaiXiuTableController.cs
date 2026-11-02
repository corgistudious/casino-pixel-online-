using System.Collections.Generic;
using KeyoGame.Bootstrap;
using KeyoGame.Games.Tables;
using KeyoGame.Localization;
using KeyoGame.Net;
using KeyoGame.UI;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace KeyoGame.Games.SicBo
{
    /// <summary>
    /// Tài Xỉu live table (shared round), milestone-1 presentation over the REAL backend:
    /// - joins with table.join, then follows `table` events through TableState (stale ones dropped);
    /// - after a reconnect (Resynced) it re-joins to read the authoritative round and myBets;
    /// - bets go only through BetGuard (one in flight, round-scoped, never re-sent);
    /// - dice values always come from the server outcome; the tumble is cosmetic and off on LOW tier.
    /// The client never computes outcomes, payouts or balances. Text comes from the shared i18n.
    /// </summary>
    public sealed class TaiXiuTableController : MonoBehaviour
    {
        private static readonly string[] MainBets = { "big", "small", "odd", "even", "anyTriple" };

        private string _tableId;
        private readonly TableState _state = new TableState();
        private readonly BetGuard _guard = new BetGuard();
        private readonly Dictionary<string, long> _pending = new Dictionary<string, long>();
        private long _chip;
        private bool _joined;
        private string _status = "";
        private long _balance = -1;

        private Text _title, _round, _phase, _countdown, _dice, _result, _mine, _history, _statusText, _confirmLabel, _balanceText;
        private readonly Dictionary<string, Text> _betLabels = new Dictionary<string, Text>();
        private long _shownSecond = -1;
        private float _tumbleUntil;
        private string _lastRevealRound;

        private KeyoApp App => KeyoApp.Instance;
        private Localizer L => App.L;

        public void Init(string tableId)
        {
            _tableId = tableId;
        }

        private void Start()
        {
            BuildUi();
            App.Connection.StateChanged += OnState;
            App.Connection.EventReceived += OnEvent;
            App.Connection.Resynced += Join;
            App.LocaleChanged += Render;
            if (App.Connection.State == ConnectionState.Ready) Join();
            OnState(App.Connection.State);
        }

        private void OnDestroy()
        {
            if (App == null) return;
            App.Connection.StateChanged -= OnState;
            App.Connection.EventReceived -= OnEvent;
            App.Connection.Resynced -= Join;
            App.LocaleChanged -= Render;
            if (_joined) App.Connection.Request("table.leave", new JObject { ["tableId"] = _tableId }, null);
        }

        private void OnState(ConnectionState s)
        {
            switch (s)
            {
                case ConnectionState.Ready:
                    if (!_joined) Join();
                    SetStatus("");
                    break;
                case ConnectionState.WaitingToReconnect:
                    SetStatus(L.Get(KeyoKeys.Reconnecting));
                    break;
                case ConnectionState.SessionExpired:
                    SetStatus(L.Get(KeyoKeys.SessionExpired));
                    break;
                case ConnectionState.Connecting:
                case ConnectionState.Authenticating:
                    SetStatus(L.Get(KeyoKeys.Connecting));
                    break;
            }
        }

        private void Join()
        {
            App.Connection.Request("table.join", new JObject { ["tableId"] = _tableId }, r =>
            {
                if (!r.Ok) { SetStatus(L.Get(KeyoKeys.Error(r.ErrorCode))); return; }
                _joined = true;
                _state.Apply(r.Data, KeyoApp.NowMs());
                _guard.Resynced(); // authoritative myBets are now known
                if (_chip <= 0) _chip = _state.MinBet;
                Render();
            });
        }

        private void OnEvent(string name, JToken data)
        {
            if (name == "table" && (string)data?["table"]?["id"] == _tableId)
            {
                if (_state.Apply(data, KeyoApp.NowMs())) Render();
            }
            else if (name == "wallet")
            {
                _balance = data?.Value<long?>("balance") ?? _balance;
                Render();
            }
        }

        private void AddChip(string kind)
        {
            if (!_state.BettingOpen(KeyoApp.NowMs()) || _chip <= 0) return;
            if (!TaiXiuRules.IsValidBet(kind, null, _chip)) return;
            _pending.TryGetValue(kind, out var cur);
            _pending[kind] = System.Math.Min(cur + _chip, _state.MaxBet > 0 ? _state.MaxBet : long.MaxValue);
            Render();
        }

        private void Confirm()
        {
            if (_pending.Count == 0) return;
            var bets = new JArray();
            foreach (var kv in _pending) bets.Add(new JObject { ["kind"] = kv.Key, ["amount"] = kv.Value });
            bool sent = _guard.TryPlace(App.Connection, _state, bets, r =>
            {
                if (r.Ok)
                {
                    _pending.Clear();
                    _balance = r.Data?.Value<long?>("balance") ?? _balance;
                    SetStatus(L.Get(KeyoKeys.Accepted));
                }
                else if (r.OutcomeUnknown)
                {
                    // Never re-send: re-read the authoritative state; the pending chips stay for the player to decide.
                    SetStatus(L.Get(KeyoKeys.OutcomeUnknown));
                    if (App.Connection.State == ConnectionState.Ready) Join();
                }
                else
                {
                    SetStatus(L.Get(r.ErrorCode == RequestResult.NotConnected ? KeyoKeys.NotConnected : KeyoKeys.Error(r.ErrorCode)));
                }
                Render();
            });
            if (sent) Render();
        }

        private void ClearPending()
        {
            _pending.Clear();
            Render();
        }

        private void SetStatus(string s)
        {
            _status = s;
            if (_statusText != null) _statusText.text = s;
        }

        private void Update()
        {
            if (_state.RoundId == null) return;
            long now = KeyoApp.NowMs();
            string key = _state.Phase == "betting" ? "locksAt" : _state.Phase == "revealing" ? "revealAt" : "nextAt";
            long sec = (_state.MsUntil(key, now) + 999) / 1000;
            if (sec != _shownSecond)
            {
                _shownSecond = sec;
                _countdown.text = sec > 0 ? sec.ToString() : "";
            }
            if (Time.unscaledTime < _tumbleUntil) _dice.text = Random.Range(1, 7) + "  " + Random.Range(1, 7) + "  " + Random.Range(1, 7);
            else if (_tumbleUntil > 0) { _tumbleUntil = 0; RenderDice(); }
        }

        private void Render()
        {
            if (_title == null) return;
            _title.text = L.Get(KeyoKeys.TaiXiuName);
            _phase.text = _state.Phase != null ? L.Get(KeyoKeys.Phase(_state.Phase)) : L.Get(KeyoKeys.Loading);
            _round.text = _state.Seq >= 0 ? L.Get(KeyoKeys.Round, new Dictionary<string, object> { ["seq"] = _state.Seq }) : "";
            _balanceText.text = _balance >= 0 ? L.Get(KeyoKeys.Balance, new Dictionary<string, object> { ["amount"] = _balance.ToString("N0") }) : "";

            foreach (var kind in MainBets)
            {
                var total = _state.Totals[kind]?.Value<long?>("amount") ?? 0;
                _pending.TryGetValue(kind, out var mine);
                _betLabels[kind].text = L.Get(KeyoKeys.TaiXiuBet(kind)) + "\n" + total.ToString("N0") + (mine > 0 ? "  (+" + mine.ToString("N0") + ")" : "");
            }

            var mineText = new System.Text.StringBuilder();
            foreach (var b in _state.MyBets) mineText.Append(L.Get(KeyoKeys.TaiXiuBet((string)b["kind"]))).Append(' ').Append(b.Value<long>("amount").ToString("N0")).Append("   ");
            _mine.text = _state.MyBets.Count > 0 ? L.Get(KeyoKeys.Placed) + ": " + mineText : "";

            var hist = new System.Text.StringBuilder();
            int n = 0;
            for (int i = _state.History.Count - 1; i >= 0 && n < 12; i--, n++)
            {
                var side = (string)_state.History[i]?["side"];
                hist.Append(side == "tai" ? L.Get(KeyoKeys.Tai) : side == "xiu" ? L.Get(KeyoKeys.Xiu) : L.Get(KeyoKeys.Triple)).Append(' ').Append((int?)_state.History[i]?["total"]).Append("  ");
            }
            _history.text = L.Get(KeyoKeys.History) + ": " + hist;

            _confirmLabel.text = _guard.Status == BetGuard.BetStatus.Sending ? L.Get(KeyoKeys.Placing) : L.Get(KeyoKeys.Confirm);

            // Reveal: start the cosmetic tumble once per round (not on LOW tier), final dice from the server.
            if (_state.Outcome != null && _lastRevealRound != _state.RoundId)
            {
                _lastRevealRound = _state.RoundId;
                _tumbleUntil = App.Quality.Settings.Effects > 0 ? Time.unscaledTime + 0.8f : 0;
            }
            if (_tumbleUntil <= 0) RenderDice();
        }

        private void RenderDice()
        {
            var o = _state.Outcome;
            if (o == null) { _dice.text = "?  ?  ?"; _result.text = ""; return; }
            var d = o["dice"] as JArray;
            _dice.text = d != null && d.Count == 3 ? d[0] + "  " + d[1] + "  " + d[2] : "?  ?  ?";
            _result.text = L.Get(KeyoKeys.DiceResult, new Dictionary<string, object> { ["dice"] = d != null ? string.Join("-", d) : "", ["total"] = (int?)o["total"] });
        }

        private void BuildUi()
        {
            var canvas = KeyoUi.CreateCanvas("TaiXiuCanvas");
            var bg = KeyoUi.Rect("Background", canvas.transform, Vector2.zero, Vector2.one);
            KeyoUi.Fill(bg, KeyoUi.Ink);
            var safe = KeyoUi.Rect("Safe", canvas.transform, Vector2.zero, Vector2.one);
            safe.gameObject.AddComponent<SafeAreaFitter>();

            _title = KeyoUi.Label(KeyoUi.Rect("Title", safe, new Vector2(0, 0.9f), new Vector2(0.5f, 1)), "T", 34, KeyoUi.Gold, TextAnchor.MiddleLeft);
            _round = KeyoUi.Label(KeyoUi.Rect("Round", safe, new Vector2(0.5f, 0.9f), new Vector2(0.75f, 1)), "R", 22, KeyoUi.Muted);
            _balanceText = KeyoUi.Label(KeyoUi.Rect("Balance", safe, new Vector2(0.75f, 0.9f), new Vector2(1, 1)), "B", 22, KeyoUi.Gold, TextAnchor.MiddleRight);
            _phase = KeyoUi.Label(KeyoUi.Rect("Phase", safe, new Vector2(0.3f, 0.8f), new Vector2(0.7f, 0.9f)), "P", 28, Color.white);
            _countdown = KeyoUi.Label(KeyoUi.Rect("Countdown", safe, new Vector2(0.7f, 0.78f), new Vector2(0.85f, 0.92f)), "C", 44, KeyoUi.Cyan);
            _dice = KeyoUi.Label(KeyoUi.Rect("Dice", safe, new Vector2(0.3f, 0.58f), new Vector2(0.7f, 0.8f)), "D", 72, Color.white);
            _result = KeyoUi.Label(KeyoUi.Rect("Result", safe, new Vector2(0.2f, 0.5f), new Vector2(0.8f, 0.58f)), "Re", 24, KeyoUi.Gold);

            float x = 0.04f, w = 0.18f, gap = 0.012f;
            foreach (var kind in MainBets)
            {
                var k = kind;
                var cell = KeyoUi.Rect("Bet_" + k, safe, new Vector2(x, 0.24f), new Vector2(x + w, 0.46f));
                KeyoUi.Button(cell, "Bet_" + k, KeyoUi.Panel, () => AddChip(k), out var label);
                _betLabels[k] = label;
                x += w + gap;
            }

            var confirm = KeyoUi.Rect("Confirm", safe, new Vector2(0.62f, 0.08f), new Vector2(0.96f, 0.2f));
            KeyoUi.Button(confirm, "Confirm", new Color(0.55f, 0.4f, 0.1f, 1f), Confirm, out _confirmLabel, 28);
            var clear = KeyoUi.Rect("Clear", safe, new Vector2(0.44f, 0.08f), new Vector2(0.6f, 0.2f));
            KeyoUi.Button(clear, "Clear", KeyoUi.Panel, ClearPending, out var clearLabel, 24);
            clearLabel.text = L.Get(KeyoKeys.Clear);

            _mine = KeyoUi.Label(KeyoUi.Rect("Mine", safe, new Vector2(0.04f, 0.08f), new Vector2(0.42f, 0.2f)), "M", 20, KeyoUi.Cyan, TextAnchor.MiddleLeft);
            _history = KeyoUi.Label(KeyoUi.Rect("History", safe, new Vector2(0.04f, 0.0f), new Vector2(0.96f, 0.07f)), "H", 18, KeyoUi.Muted, TextAnchor.MiddleLeft);
            _statusText = KeyoUi.Label(KeyoUi.Rect("Status", safe, new Vector2(0.2f, 0.46f), new Vector2(0.8f, 0.52f)), "S", 22, KeyoUi.Cyan);
            Render();
        }
    }
}
