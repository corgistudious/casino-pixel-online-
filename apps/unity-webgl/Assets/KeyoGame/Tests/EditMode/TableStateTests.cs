using KeyoGame.Games.Tables;
using KeyoGame.Net;
using Newtonsoft.Json.Linq;
using NUnit.Framework;

namespace KeyoGame.Tests
{
    public class TableStateTests
    {
        private static JObject View(long seq, string phase, string roundId = null, object myBets = null, long serverNow = 1_000_000, string locksAt = "1970-01-01T00:16:50Z")
        {
            var v = JObject.FromObject(new
            {
                table = new { id = "tx-1", game = "taixiu", minBet = 100, maxBet = 1_000_000 },
                round = new { id = roundId ?? "round-" + seq, seq, phase, status = phase == "betting" ? "betting" : "locked", locksAt, outcome = (object)null },
                serverNow,
                totals = new { big = new { amount = 500, players = 2 } },
                bettors = 2,
                watchers = 5,
                history = new object[0],
            });
            if (myBets != null) v["myBets"] = JArray.FromObject(myBets);
            return v;
        }

        [Test]
        public void NewerSnapshotsApplyOlderOrDuplicatedOnesAreDropped()
        {
            var s = new TableState();
            Assert.IsTrue(s.Apply(View(5, "betting"), 0));
            Assert.IsTrue(s.Apply(View(5, "revealing"), 0));
            Assert.IsFalse(s.Apply(View(5, "betting"), 0), "a late betting snapshot of the same round is stale");
            Assert.IsFalse(s.Apply(View(4, "result"), 0), "an older round is stale");
            Assert.IsTrue(s.Apply(View(5, "revealing"), 0), "same phase refresh (presence update) is accepted");
            Assert.IsTrue(s.Apply(View(6, "shaking"), 0));
            Assert.AreEqual(2, s.Dropped);
            Assert.AreEqual("shaking", s.Phase);
        }

        [Test]
        public void MyBetsAreKeptAcrossBroadcastsOfTheSameRoundAndClearedForANewRound()
        {
            var s = new TableState();
            s.Apply(View(5, "betting", myBets: new[] { new { id = "b1", kind = "big", amount = 100 } }), 0);
            Assert.AreEqual(1, s.MyBets.Count);
            s.Apply(View(5, "revealing"), 0); // broadcast without myBets
            Assert.AreEqual(1, s.MyBets.Count);
            s.Apply(View(6, "shaking"), 0);
            Assert.AreEqual(0, s.MyBets.Count);
        }

        [Test]
        public void CountdownUsesServerTime()
        {
            var s = new TableState();
            // serverNow 1 000 000 ms, locksAt = 1 010 000 ms → 10 s left, whatever the local clock says.
            s.Apply(View(1, "betting", serverNow: 1_000_000), 500);
            Assert.AreEqual(10000, s.MsUntil("locksAt", 500));
            Assert.AreEqual(4000, s.MsUntil("locksAt", 6500));
            Assert.IsTrue(s.BettingOpen(6500));
            Assert.IsFalse(s.BettingOpen(20000));
            Assert.AreEqual(0, s.MsUntil("unknown", 0));
        }

        [Test]
        public void InvalidViewsAreIgnored()
        {
            var s = new TableState();
            Assert.IsFalse(s.Apply(null, 0));
            Assert.IsFalse(s.Apply(JObject.Parse("{}"), 0));
            Assert.IsFalse(s.Apply(View(1, "dancing"), 0));
        }

        [Test]
        public void BetGuardSendsOnceBlocksDoubleTapAndNeverResendsAfterALostAnswer()
        {
            var t = new FakeTransport();
            var c = new KeyoConnection(t, () => "tok");
            c.Start("wss://x", 0);
            t.ServerOpen();
            t.Answer(t.Last("auth"), new { user = new { uid = 1 } });

            var s = new TableState();
            s.Apply(View(7, "betting"), 0);
            var g = new BetGuard();
            var bets = JArray.FromObject(new[] { new { kind = "big", amount = 100 } });

            Assert.IsTrue(g.TryPlace(c, s, bets, null));
            Assert.IsFalse(g.TryPlace(c, s, bets, null), "double tap while in flight sends nothing");
            Assert.AreEqual(1, t.CountOf("table.bet"));
            var req = t.Last("table.bet");
            Assert.AreEqual("round-7", (string)req["roundId"]);
            Assert.AreEqual("tx-1", (string)req["tableId"]);

            t.ServerClose(1006); // answer lost
            Assert.AreEqual(BetGuard.BetStatus.Unknown, g.Status);
            Assert.IsFalse(g.TryPlace(c, s, bets, null), "no new bet until the authoritative state was re-read");
            g.Resynced();
            Assert.AreEqual(BetGuard.BetStatus.Idle, g.Status);
            Assert.AreEqual(1, t.CountOf("table.bet"), "the lost bet was never re-sent");
        }

        [Test]
        public void BetGuardStoresAuthoritativeMyBetsFromTheAnswer()
        {
            var t = new FakeTransport();
            var c = new KeyoConnection(t, () => "tok");
            c.Start("wss://x", 0);
            t.ServerOpen();
            t.Answer(t.Last("auth"), new { user = new { uid = 1 } });
            var s = new TableState();
            s.Apply(View(7, "betting"), 0);
            var g = new BetGuard();
            g.TryPlace(c, s, JArray.FromObject(new[] { new { kind = "small", amount = 200 } }), null);
            t.Answer(t.Last("table.bet"), new { myBets = new[] { new { id = "b9", kind = "small", amount = 200, status = "placed" } }, balance = 800 });
            Assert.AreEqual(BetGuard.BetStatus.Idle, g.Status);
            Assert.AreEqual("b9", (string)s.MyBets[0]["id"]);
        }

        [Test]
        public void TaiXiuValidationMirrorsTheSharedRules()
        {
            Assert.IsTrue(TaiXiuRules.IsValidBet("big", null, 100));
            Assert.IsTrue(TaiXiuRules.IsValidBet("total", 4, 100));
            Assert.IsTrue(TaiXiuRules.IsValidBet("total", 17, 100));
            Assert.IsFalse(TaiXiuRules.IsValidBet("total", 3, 100));
            Assert.IsFalse(TaiXiuRules.IsValidBet("total", null, 100));
            Assert.IsTrue(TaiXiuRules.IsValidBet("single", 6, 100));
            Assert.IsFalse(TaiXiuRules.IsValidBet("single", 7, 100));
            Assert.IsFalse(TaiXiuRules.IsValidBet("big", 3, 100), "big takes no value");
            Assert.IsFalse(TaiXiuRules.IsValidBet("big", null, 0));
            Assert.IsFalse(TaiXiuRules.IsValidBet("tai", null, 100), "only the server's bet kinds");
        }
    }
}
