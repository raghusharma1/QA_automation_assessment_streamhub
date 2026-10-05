-- Scenario 1 seed. Synthetic accounts and transactions; every group of rows is one edge case.
-- The expected result for each case (sql/README.md) was worked out by hand before running the query.
INSERT INTO accounts (account_id, holder_name, opened_at) VALUES
('ACC001', 'Aarav Mehta',  '2023-01-10 10:00:00'),
('ACC002', 'Bhavna Rao',   '2023-02-11 10:00:00'),
('ACC003', 'Chirag Shah',  '2023-03-12 10:00:00'),
('ACC004', 'Divya Nair',   '2023-04-13 10:00:00'),
('ACC005', 'Esha Kapoor',  '2023-05-14 10:00:00'),
('ACC006', 'Farhan Ali',   '2023-06-15 10:00:00'),
('ACC007', 'Gauri Iyer',   '2023-07-16 10:00:00'),
('ACC008', 'Harsh Verma',  '2023-08-17 10:00:00'),
('ACC009', 'Isha Gupta',   '2023-09-18 10:00:00'),
('ACC010', 'Jay Patel',    '2023-10-19 10:00:00'),
('ACC011', 'Kavya Menon',  '2023-11-20 10:00:00'),
('ACC012', 'Lakshay Jain', '2023-12-21 10:00:00');

INSERT INTO transactions (txn_id, from_account, to_account, amount, created_at) VALUES
-- E1  basic round trip, -5%, 6h30m                          -> match (1,2)
( 1, 'ACC001', 'ACC002', 1000.00, '2024-03-01 09:00:00'),
( 2, 'ACC002', 'ACC001',  950.00, '2024-03-01 15:30:00'),
-- E2  exactly +10.00%                                       -> match (3,4)
( 3, 'ACC003', 'ACC004',  100.00, '2024-03-02 10:00:00'),
( 4, 'ACC004', 'ACC003',  110.00, '2024-03-02 12:00:00'),
-- E3  +10.01%, just outside the tolerance                   -> no match
( 5, 'ACC005', 'ACC006',  100.00, '2024-03-03 10:00:00'),
( 6, 'ACC006', 'ACC005',  110.01, '2024-03-03 11:00:00'),
-- E4  gap of exactly 24h00m00s                              -> match (7,8)
( 7, 'ACC007', 'ACC008',  500.00, '2024-03-04 08:00:00'),
( 8, 'ACC008', 'ACC007',  500.00, '2024-03-05 08:00:00'),
-- E5  gap of 24h00m01s                                      -> no match
( 9, 'ACC009', 'ACC010',  750.00, '2024-03-06 08:00:00'),
(10, 'ACC010', 'ACC009',  750.00, '2024-03-07 08:00:01'),
-- E6  ACC012 pays first, ACC011 pays back                   -> match once, original = 11
(11, 'ACC012', 'ACC011',  300.00, '2024-03-08 07:00:00'),
(12, 'ACC011', 'ACC012',  300.00, '2024-03-08 09:00:00'),
-- E7  two originals, one return (many-to-one)               -> (13,15), (14,15); one-to-one: (14,15)
(13, 'ACC001', 'ACC002', 2000.00, '2024-03-10 10:00:00'),
(14, 'ACC001', 'ACC002', 2000.00, '2024-03-10 11:00:00'),
(15, 'ACC002', 'ACC001', 1900.00, '2024-03-10 18:00:00'),
-- E8  one original, two returns (one-to-many)               -> (16,17), (16,18); one-to-one: (16,17)
(16, 'ACC003', 'ACC004',  400.00, '2024-03-11 09:00:00'),
(17, 'ACC004', 'ACC003',  400.00, '2024-03-11 10:00:00'),
(18, 'ACC004', 'ACC003',  380.00, '2024-03-11 12:00:00'),
-- E9  self-transfers A->A twice                             -> no match
(19, 'ACC005', 'ACC005',  200.00, '2024-03-12 09:00:00'),
(20, 'ACC005', 'ACC005',  200.00, '2024-03-12 10:00:00'),
-- E10 A->B->C->A through a third party (not a direct return) -> no match
(21, 'ACC006', 'ACC007',  600.00, '2024-03-13 09:00:00'),
(22, 'ACC007', 'ACC008',  600.00, '2024-03-13 10:00:00'),
(23, 'ACC008', 'ACC006',  600.00, '2024-03-13 11:00:00'),
-- E11 exactly -10.00% (lower bound)                         -> match (24,25)
(24, 'ACC009', 'ACC011',  250.00, '2024-03-14 09:00:00'),
(25, 'ACC011', 'ACC009',  225.00, '2024-03-14 09:30:00'),
-- E12 one-way transfer, never returned                      -> no match
(26, 'ACC010', 'ACC012',  999.00, '2024-03-15 09:00:00');
