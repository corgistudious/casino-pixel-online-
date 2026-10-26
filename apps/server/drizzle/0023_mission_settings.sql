-- Owner-editable mission rewards (overrides of the code defaults). One row; additive.
CREATE TABLE IF NOT EXISTS mission_settings (
 id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 rewards jsonb NOT NULL DEFAULT '{}'::jsonb,
 vip_exp_weekly_cap integer CHECK (vip_exp_weekly_cap BETWEEN 0 AND 300),
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
