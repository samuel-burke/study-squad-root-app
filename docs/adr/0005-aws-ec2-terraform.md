# 0005. One EC2 box on AWS, described in Terraform

**Status:** Accepted, 2026-11-13. Supersedes an earlier Fly.io setup that never shipped.

## Context

The Discord host is a long-running Node process with in-memory rooms,
WebSockets, timers and a local disk. The budget is about $5 to $10 a month.

Options considered:

- **Vercel or Supabase:** serverless functions don't hold WebSockets or
  timers, and the server would need a rewrite onto Postgres.
- **Fly.io:** simplest, about $6, but less widely used.
- **AWS ECS Fargate or Lambda:** no disk for SQLite, more moving parts, and
  Fargate plus a load balancer is over $25.
- **AWS EC2:** a plain box with a disk, about $11.

## Decision

One t4g.micro (Graviton, 1 GB) in us-east-1, running the host in Docker
behind Caddy for HTTPS, with the data on a separate encrypted EBS disk. All
of it is in Terraform (`infra/`) with state in S3 and S3-native locking.

## Consequences

- The whole setup is reviewable code and can be rebuilt with `terraform apply`.
- Graviton is about 20% cheaper than x86 at the same size; CI builds the
  image on an arm64 runner.
- One box is a single point of failure. AWS auto-recovers it on hardware
  failure and reboots it if the OS hangs; data survives on the disk and in
  S3 (0007). Planned downtime is a few seconds per deploy, and clients
  reconnect on their own.
- About $11 a month, slightly over budget, mostly the box and its public
  IPv4 address. A Savings Plan brings it to about $9.
