# Architecture decision records

Short notes on the big choices behind Study Squad on Root and Discord: the
problem, what was decided, and what it costs. Each follows the usual ADR
shape (Context, Decision, Consequences). A decision that changes gets a new
record that supersedes the old one, so the history stays readable.

| #                                   | Decision                                                     |
| ----------------------------------- | ------------------------------------------------------------ |
| [0001](0001-monorepo.md)            | One repo for Root and Discord, with npm workspaces           |
| [0002](0002-protobuf-contract.md)   | Protobuf is the API contract on both platforms               |
| [0003](0003-database-per-server.md) | One SQLite database per Discord server                       |
| [0004](0004-worker-per-server.md)   | One worker thread per Discord server, behind a Root SDK shim |
| [0005](0005-aws-ec2-terraform.md)   | One EC2 box on AWS, described in Terraform                   |
| [0006](0006-idle-sleep.md)          | Quiet servers sleep and wake on demand                       |
| [0007](0007-backups.md)             | Litestream to S3 plus nightly disk snapshots                 |
| [0008](0008-deploys-oidc-ssm.md)    | Deploys use GitHub OIDC and SSM, with no SSH or stored keys  |
| [0009](0009-scaling-path.md)        | How it scales past one box                                   |
