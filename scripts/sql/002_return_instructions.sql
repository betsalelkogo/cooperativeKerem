ALTER TABLE tools
  ADD COLUMN IF NOT EXISTS return_instructions JSONB;

INSERT INTO settings (id, data)
VALUES (
  'return-instructions',
  '{"rules":[{"id":"ri-1","text":"נקו את הכלי לפני ההחזרה"},{"id":"ri-2","text":"בדקו שכל החלקים במקום ותקינים"},{"id":"ri-3","text":"החזירו את הכלי למיקום המדויק במחסן"}]}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
