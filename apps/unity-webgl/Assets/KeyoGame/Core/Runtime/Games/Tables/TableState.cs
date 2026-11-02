using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace KeyoGame.Games.Tables
{
    /// <summary>
    /// Client-side mirror of one shared-round table (Tài Xỉu / Roulette), built only from server views
    /// (packages/shared/src/games/tables.ts, TableRoundView). The client never computes outcomes or
    /// payouts; it only decides which server snapshot is the newest.
    ///
    /// Ordering / de-duplication: a snapshot is newer when its round.seq is higher, or the same round in a
    /// later (or equal) phase. Older snapshots (late or duplicated events after a reconnect) are dropped.
    /// `table` events omit myBets (they are broadcast); the last known myBets of the same round are kept.
    /// </summary>
    public sealed class TableState
    {
        public static readonly string[] PhaseOrder = { "shaking", "betting", "revealing", "result" };

        public string TableId { get; private set; }
        public string Game { get; private set; }
        public string RoundId { get; private set; }
        public long Seq { get; private set; } = -1;
        public string Phase { get; private set; }
        public string Status { get; private set; }
        public JToken Outcome { get; private set; }
        public JArray History { get; private set; } = new JArray();
        public JObject Totals { get; private set; } = new JObject();
        public JArray MyBets { get; private set; } = new JArray();
        public long MinBet { get; private set; }
        public long MaxBet { get; private set; }
        public int Bettors { get; private set; }
        public int Watchers { get; private set; }
        /// <summary>serverNow − local clock, to draw countdowns in server time.</summary>
        public long ClockOffsetMs { get; private set; }
        public int Dropped { get; private set; }

        private readonly Dictionary<string, long> _times = new Dictionary<string, long>();

        public static int PhaseIndex(string phase) => Array.IndexOf(PhaseOrder, phase);

        /// <summary>Applies a TableRoundView (from table.join or a `table` event). Returns false when dropped as stale.</summary>
        public bool Apply(JToken view, long localNowMs)
        {
            if (view == null || view.Type != JTokenType.Object) return false;
            var round = view["round"];
            if (round == null) return false;
            long seq = round.Value<long?>("seq") ?? -1;
            string phase = (string)round["phase"];
            string roundId = (string)round["id"];
            if (seq < 0 || roundId == null || PhaseIndex(phase) < 0) return false;

            if (Seq >= 0 && (seq < Seq || (seq == Seq && PhaseIndex(phase) < PhaseIndex(Phase))))
            {
                Dropped++;
                return false;
            }

            bool sameRound = roundId == RoundId;
            var table = view["table"];
            TableId = (string)table?["id"] ?? TableId;
            Game = (string)table?["game"] ?? Game;
            MinBet = table?.Value<long?>("minBet") ?? MinBet;
            MaxBet = table?.Value<long?>("maxBet") ?? MaxBet;

            RoundId = roundId;
            Seq = seq;
            Phase = phase;
            Status = (string)round["status"];
            Outcome = round["outcome"]?.Type == JTokenType.Null ? null : round["outcome"];
            foreach (var k in new[] { "opensAt", "betsOpenAt", "locksAt", "revealAt", "nextAt" })
            {
                if (DateTimeOffset.TryParse((string)round[k], System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AssumeUniversal, out var t))
                    _times[k] = t.ToUnixTimeMilliseconds();
            }
            var serverNow = view.Value<long?>("serverNow");
            if (serverNow.HasValue) ClockOffsetMs = serverNow.Value - localNowMs;
            Totals = view["totals"] as JObject ?? new JObject();
            History = view["history"] as JArray ?? new JArray();
            Bettors = view.Value<int?>("bettors") ?? 0;
            Watchers = view.Value<int?>("watchers") ?? 0;

            if (view["myBets"] is JArray mine) MyBets = mine;
            else if (!sameRound) MyBets = new JArray();
            return true;
        }

        /// <summary>Replaces my bets with the authoritative list from a table.bet answer.</summary>
        public void SetMyBets(JArray bets, string roundId)
        {
            if (roundId == RoundId && bets != null) MyBets = bets;
        }

        /// <summary>Milliseconds until a round time (opensAt, betsOpenAt, locksAt, revealAt, nextAt), in server time; ≥ 0.</summary>
        public long MsUntil(string key, long localNowMs)
        {
            if (!_times.TryGetValue(key, out var t)) return 0;
            return Math.Max(0, t - (localNowMs + ClockOffsetMs));
        }

        public bool BettingOpen(long localNowMs) => Phase == "betting" && Status == "betting" && MsUntil("locksAt", localNowMs) > 0;
    }
}
