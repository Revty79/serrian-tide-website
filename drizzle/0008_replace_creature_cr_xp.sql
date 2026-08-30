UPDATE "challenge_rating_reference" AS reference
SET "kill_xp" = canonical."kill_xp"
FROM (VALUES
  (1, 2),
  (2, 3),
  (3, 4),
  (4, 5),
  (5, 7),
  (6, 9),
  (7, 11),
  (8, 13),
  (9, 15),
  (10, 18),
  (11, 21),
  (12, 24),
  (13, 27),
  (14, 30),
  (15, 34),
  (16, 38),
  (17, 42),
  (18, 46),
  (19, 50),
  (20, 55),
  (21, 60),
  (22, 65),
  (23, 70),
  (24, 75),
  (25, 81),
  (26, 87),
  (27, 93),
  (28, 100),
  (29, 107),
  (30, 115),
  (31, 123),
  (32, 131),
  (33, 139),
  (34, 147),
  (35, 156),
  (36, 165),
  (37, 174),
  (38, 183),
  (39, 192),
  (40, 201),
  (41, 211),
  (42, 221),
  (43, 231),
  (44, 241),
  (45, 252),
  (46, 263),
  (47, 274),
  (48, 286),
  (49, 298),
  (50, 310)
) AS canonical("challenge_rating", "kill_xp")
WHERE reference."challenge_rating" = canonical."challenge_rating";
--> statement-breakpoint
UPDATE "creatures" AS creature
SET "kill_xp" = reference."kill_xp"
FROM "challenge_rating_reference" AS reference
WHERE creature."challenge_rating" = reference."challenge_rating"
  AND creature."challenge_rating" BETWEEN 1 AND 50;
