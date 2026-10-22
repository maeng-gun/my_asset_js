-- ==============================================================================
-- Migration: fix_rls_and_oct30_privileges
-- Purpose:
--   1. Supabase Security Advisor 경고(rls_disabled_in_public, rls_enabled_no_policy) 완전 해소
--   2. 과도하게 열려있던 기존 anon ALL 정책 제거 (Principle of Least Privilege 적용)
--   3. 2026년 10월 30일부로 적용되는 Data API 자동 권한 부여 폐지 Breaking Change 대비
-- ==============================================================================

-- 1. 위험한 레거시 Anon 정책 회수 및 역할 축소
-- (기존에 anon, authenticated, service_role 전체에 ALL이 열려 있던 정책을 service_role로 축소)
ALTER POLICY "Allow all asset_ratio" ON public.asset_ratio TO service_role USING (true) WITH CHECK (true);
ALTER POLICY "Allow all asset_ratio" ON public.asset_ratio RENAME TO "Allow service_role full access";

ALTER POLICY "Allow all holdings" ON public.holdings TO service_role USING (true) WITH CHECK (true);
ALTER POLICY "Allow all holdings" ON public.holdings RENAME TO "Allow service_role full access";

ALTER POLICY "Allow all inflow" ON public.inflow TO service_role USING (true) WITH CHECK (true);
ALTER POLICY "Allow all inflow" ON public.inflow RENAME TO "Allow service_role full access";

ALTER POLICY "Allow all return" ON public.return TO service_role USING (true) WITH CHECK (true);
ALTER POLICY "Allow all return" ON public.return RENAME TO "Allow service_role full access";

ALTER POLICY "Allow all for latest_portfolio_summary" ON public.latest_portfolio_summary TO authenticated USING (true) WITH CHECK (true);
ALTER POLICY "Allow all for latest_portfolio_summary" ON public.latest_portfolio_summary RENAME TO "Allow authenticated full access";

-- 2. 모든 public 테이블 RLS 강제 활성화 (기존 미활성화 테이블 포함)
ALTER TABLE public."KISboolio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allo_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_ratio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eval_profit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.latest_portfolio_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macro_daily_asset_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macro_daily_portfolio_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macro_topic_shocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pension ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pension_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickers ENABLE ROW LEVEL SECURITY;

-- 3. service_role 명시적 ALL 정책 등록 (백엔드 스크립트 및 퀀트 파이프라인 안전성 확보)
CREATE POLICY "Allow service_role full access" ON public."KISboolio" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.allo_table FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.assets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.assets_daily FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.eval_profit FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.groups FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.latest_portfolio_summary FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.macro_daily_asset_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.macro_daily_portfolio_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.macro_topic_shocks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.pension FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.pension_daily FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Allow service_role full access" ON public.tickers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. authenticated (로그인 사용자) 정책 등록
CREATE POLICY "Allow authenticated full access" ON public."KISboolio" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access" ON public.assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access" ON public.pension FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 매크로 지표 읽기 전용 접근 허용
CREATE POLICY "Allow authenticated read access" ON public.macro_daily_asset_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON public.macro_daily_portfolio_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read access" ON public.macro_topic_shocks FOR SELECT TO authenticated USING (true);

-- 5. anon (익명) 정책 등록: 공개 메타데이터 및 정적 매크로 지표 SELECT만 허용
CREATE POLICY "Allow anon read access" ON public.macro_daily_asset_scores FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read access" ON public.macro_daily_portfolio_scores FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read access" ON public.macro_topic_shocks FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read access" ON public.tickers FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read access" ON public.categories FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read access" ON public.groups FOR SELECT TO anon USING (true);

-- 6. 10월 30일 Breaking Change 대응: 명시적 GRANT 및 불필요 권한 회수(REVOKE)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- anon 권한 전면 회수 후 공개 테이블만 SELECT 부여
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

GRANT SELECT ON public.macro_daily_asset_scores, 
                public.macro_daily_portfolio_scores, 
                public.macro_topic_shocks, 
                public.tickers, 
                public.categories, 
                public.groups TO anon;

-- authenticated 권한 부여
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- service_role 전체 권한 부여
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 7. 향후 신규 생성 테이블/시퀀스를 위한 기본 권한(DEFAULT PRIVILEGES) 영구 설정
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;
