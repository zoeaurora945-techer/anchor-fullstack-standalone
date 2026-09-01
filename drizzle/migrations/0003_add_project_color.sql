-- Migration: add color column to projects table
ALTER TABLE projects
  ADD COLUMN color VARCHAR(16) NOT NULL DEFAULT '#7FB5D6' AFTER status;
