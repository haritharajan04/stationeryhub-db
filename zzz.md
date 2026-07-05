# In-Depth Guide: How Database Systems Work Internally

This guide explains the inner workings of a Relational Database Management System (RDBMS) like PostgreSQL, detail by detail, from storage disks to query processing and transaction execution.

---

## 1. High-Level Architecture of a Database

When you send a SQL query like `SELECT * FROM users WHERE id = 1;` to PostgreSQL, it passes through several architectural layers:

```
[ Client (e.g. VSCode, Node.js App) ]
               │
               ▼  (TCP Connection / Connection Pool)
┌─────────────────────────────────────────────────────────┐
│ 1. TRANSPORT LAYER (Connection Manager & Threads)       │
└──────────────┬──────────────────────────────────────────┘
               │ Raw SQL string
               ▼
┌─────────────────────────────────────────────────────────┐
│ 2. QUERY PROCESSOR                                      │
│    ├── Parser (Checks SQL syntax & compiles AST)         │
│    ├── Analyzer (Checks table/column names & permissions)│
│    └── Rewriter (Applies view definitions & rules)       │
└──────────────┬──────────────────────────────────────────┘
               │ Abstract Syntax Tree (AST)
               ▼
┌─────────────────────────────────────────────────────────┐
│ 3. QUERY OPTIMIZER & PLANNER                            │
│    ├── Calculates cost metrics (CPU, disk I/O)          │
│    └── Selects execution path (Index Scan vs Seq Scan)  │
└──────────────┬──────────────────────────────────────────┘
               │ Execution Plan
               ▼
┌─────────────────────────────────────────────────────────┐
│ 4. EXECUTION ENGINE                                     │
│    └── Runs plan steps & requests raw pages from buffer │
└──────────────┬──────────────────────────────────────────┘
               │ Request page / block
               ▼
┌─────────────────────────────────────────────────────────┐
│ 5. STORAGE ENGINE                                       │
│    ├── Shared Buffer / Cache Manager                    │
│    ├── Transaction Manager (ACID, Locks, MVCC)          │
│    └── Disk Storage (WAL logs, Data files, B-Trees)     │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Storage Engine: How Data Lives on Disk

Computers read and write data in units called **Blocks** or **Pages** (in PostgreSQL, the default page size is **8 KB**). A database doesn’t store rows as simple text files; it organizes pages into structured files:

### A. The Page Layout (Slotted-Page Architecture)
A single 8 KB data page is organized to allow fast insertions and variable-length text fields:
* **Page Header**: Stores metadata about the page (size, free space pointers).
* **Line Pointers (Offset Array)**: Small pointers growing *downward* from the top. Each pointer points to where a row actually starts inside the page.
* **Free Space**: Empty space in the middle.
* **Tuple (Row) Storage**: The actual data rows, inserted growing *upward* from the bottom.

This layout allows rows to shrink or grow without shifting other rows; the database only needs to update the line pointer offset.

### B. The Write-Ahead Log (WAL)
Writing to disk is slow (disk I/O bottlenecks). If the database modified the 8KB data page on disk every time a single row changed, it would be extremely slow.
* **Solution**: Before modifying any data file, the database writes the change to an append-only file called the **Write-Ahead Log (WAL)**.
* **Why it works**: Appending sequentially to the end of a log is fast. If the power cuts out, the database reads the WAL during recovery to reconstruct any changes that weren't yet saved to the main tables.

---

## 3. Query Processing & Optimization

The **Optimizer** is the brain of the database. For any query, there are dozens of ways to retrieve the data. The optimizer analyzes database statistics (updated periodically in background tables) to calculate the "cost" (CPU cycles and disk page fetches) of each route:

### Core Scanning Methods:
1. **Sequential Scan (Seq Scan)**: The database reads the table file page-by-page from start to finish. Essential for fetching a large portion of a table.
2. **Index Scan**: The database navigates an index tree (usually a B-Tree) to find pointers to specific rows, then fetches only those specific pages. Excellent for finding a single record.
3. **Index Only Scan**: If all requested columns exist inside the index tree itself (e.g., querying `SELECT id FROM users`), the database skips reading the table files entirely.

---

## 4. Understanding Indexes (B-Trees)

An Index is a helper data structure that speeds up searches. The standard index type is the **B-Tree (Balanced Tree)**:

```
                  [ Root Node: Value > 50 ]
                         /        \
                        v          v
          [ Leaf Node: 10 to 50 ]  [ Leaf Node: 51 to 100 ]
               /      |      \          /      |      \
              v       v       v        v       v       v
            [Row1]  [Row2]  [Row3]   [Row4]  [Row5]  [Row6]
```

* **Self-Balancing**: A B-Tree ensures that every leaf node (where the pointers to the actual disk rows are stored) is at the exact same depth.
* **Logarithmic Time Complexity**: Searching a table with 1,000,000 rows sequentially takes up to 1,000,000 checks. With a B-Tree index, it takes only 3 to 4 node jumps to find the exact record.

---

## 5. Transactions & ACID Properties

A transaction is a group of SQL statements executed as a single unit of work. To ensure correctness, databases guarantee the **ACID** properties:

### A. Atomicity ("All or Nothing")
* **What it means**: If one statement in a transaction fails, the entire transaction is rolled back (undone).
* **How it works**: The database keeps track of changes in the WAL. If a rollback is triggered, it uses these logs to revert any changes.

### B. Consistency ("Valid State")
* **What it means**: The database must transition from one valid state to another, conforming to all constraints (PK, FK, CHECK constraints).
* **How it works**: If you attempt to insert an order with an invalid customer ID, the foreign key constraint immediately rejects it.

### C. Isolation ("Invisible Actions")
* **What it means**: Multiple transactions running concurrently should not interfere with or see each other's half-finished work.
* **How it works**: Done through **MVCC (Multi-Version Concurrency Control)**. When you modify a row in PostgreSQL, it doesn't overwrite it immediately. It writes a *new version* of that row. Other users reading the table continue to see the *old version* until your transaction commits.

### D. Durability ("Written in Stone")
* **What it means**: Once a transaction commits, it is permanently saved, even if the power cuts out immediately after.
* **How it works**: The commit statement blocks until the transaction's WAL records are flushed to non-volatile disk storage.
