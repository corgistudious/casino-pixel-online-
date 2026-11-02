using System;
using KeyoGame.Net;
using Newtonsoft.Json.Linq;

namespace KeyoGame.Games.Tables
{
    /// <summary>
    /// Places bets on a shared-round table without ever duplicating one:
    /// - one bet request in flight at a time (button mashing does nothing);
    /// - the request names the round (server rejects bets for another round);
    /// - never re-sent: if the answer is lost (connection_lost / timeout) the state becomes Unknown and the
    ///   caller must resync (table.join returns the authoritative myBets) before betting again.
    /// </summary>
    public sealed class BetGuard
    {
        public enum BetStatus { Idle, Sending, Unknown }

        public BetStatus Status { get; private set; } = BetStatus.Idle;

        /// <summary>Returns false (nothing sent) when a bet is in flight or its outcome is unknown.</summary>
        public bool TryPlace(KeyoConnection conn, TableState table, JArray bets, Action<RequestResult> done)
        {
            if (Status != BetStatus.Idle || conn == null || table?.RoundId == null || bets == null || bets.Count == 0) return false;
            Status = BetStatus.Sending;
            var payload = new JObject { ["tableId"] = table.TableId, ["roundId"] = table.RoundId, ["bets"] = bets };
            var roundId = table.RoundId;
            conn.Request("table.bet", payload, r =>
            {
                if (r.Ok) table.SetMyBets(r.Data?["myBets"] as JArray, roundId);
                Status = r.OutcomeUnknown ? BetStatus.Unknown : BetStatus.Idle;
                done?.Invoke(r);
            });
            return true;
        }

        /// <summary>Call after a fresh table.join snapshot was applied (authoritative myBets).</summary>
        public void Resynced()
        {
            if (Status == BetStatus.Unknown) Status = BetStatus.Idle;
        }
    }
}
