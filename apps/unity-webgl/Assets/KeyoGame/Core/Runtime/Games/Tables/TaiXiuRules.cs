namespace KeyoGame.Games.Tables
{
    /// <summary>
    /// Mirror of isValidTableBet for Tài Xỉu (packages/shared/src/games/tables.ts), used ONLY to enable or
    /// disable bet buttons. The server re-validates every bet; this never decides an outcome or payout.
    /// </summary>
    public static class TaiXiuRules
    {
        /// <summary>Exactly TAIXIU_BET_KINDS from packages/shared (a parity test reads the TS source).</summary>
        public static readonly string[] BetKinds = { "big", "small", "odd", "even", "total", "single", "anyTriple" };

        public static bool IsValidBet(string kind, int? value, long amount)
        {
            if (amount <= 0) return false;
            if (System.Array.IndexOf(BetKinds, kind) < 0) return false;
            if (kind == "total") return value.HasValue && value.Value >= 4 && value.Value <= 17;
            if (kind == "single") return value.HasValue && value.Value >= 1 && value.Value <= 6;
            return !value.HasValue;
        }
    }
}
