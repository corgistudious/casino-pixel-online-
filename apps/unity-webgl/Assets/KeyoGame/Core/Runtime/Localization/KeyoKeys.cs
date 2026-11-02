namespace KeyoGame.Localization
{
    /// <summary>
    /// Every translation key the Unity frontend uses, in one place. A test checks that each exists in
    /// BOTH locales of the exported keyo-i18n.json, so a missing translation fails CI instead of showing
    /// a raw key to players. Server error codes use "errors.&lt;code&gt;" exactly like the React app.
    /// </summary>
    public static class KeyoKeys
    {
        public const string TaiXiuName = "games.taixiu.name";
        public const string Round = "tables.round";
        public const string Placed = "tables.placed";
        public const string Confirm = "tables.confirm";
        public const string Placing = "tables.placing";
        public const string Accepted = "tables.accepted";
        public const string Pool = "tables.pool";
        public const string History = "tables.history";
        public const string YouWon = "tables.youWon";
        public const string YouLost = "tables.youLost";
        public const string Refunded = "tables.refunded";
        public const string Paused = "tables.paused";
        public const string ClosingSoon = "tables.closingSoon";
        public const string Tai = "tables.tai";
        public const string Xiu = "tables.xiu";
        public const string Triple = "tables.triple";
        public const string DiceResult = "sicbo.result";
        public const string Connecting = "unity.connecting";
        public const string Reconnecting = "unity.reconnecting";
        public const string SessionExpired = "unity.sessionExpired";
        public const string OutcomeUnknown = "unity.outcomeUnknown";
        public const string NotConnected = "unity.notConnected";
        public const string Loading = "unity.loading";
        public const string Clear = "unity.clear";
        public const string Balance = "unity.balance";

        public static string Phase(string phase) => "tables.phase." + phase;
        public static string TaiXiuBet(string kind) => "sicbo." + kind;
        public static string Error(string code) => "errors." + code;

        public static readonly string[] Static =
        {
            TaiXiuName, Round, Placed, Confirm, Placing, Accepted, Pool, History, YouWon, YouLost, Refunded, Paused, ClosingSoon,
            Tai, Xiu, Triple, DiceResult, Connecting, Reconnecting, SessionExpired, OutcomeUnknown, NotConnected, Loading, Clear, Balance,
        };
    }
}
