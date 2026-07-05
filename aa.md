# Advanced Database Systems: Core Engineering & Internals

This reference guide explains the low-level engineering principles of relational databases, focusing on transaction concurrency, memory caching, query execution, and indexing mechanics.

---

## Module 1: Concurrency Control & MVCC (Isolation Internals)

How does a database allow thousands of users to read and write to the same table concurrently without corrupting data or freezing the system?

### A. The Mechanics of Multi-Version Concurrency Control (MVCC)
In PostgreSQL, updating a row does not overwrite the data in place. Instead, it creates a new version of the row. Every row on disk contains hidden system columns used to manage visibility:
* **`xmin`**: The Transaction ID (TxID) that created/inserted this version of the row.
* **`xmax`**: The Transaction ID that deleted or updated (which is a delete + insert) this version of the row. If the row is active, `xmax` is `0`.

#### How Visibility is Determined:
When transaction `Tx 101` reads the database, it gets a snapshot of active transactions. A row is visible to `Tx 101` if:
1. The transaction that created it (`xmin`) has committed and is less than `101`.
2. The transaction that deleted it (`xmax`) has not committed, is greater than `101`, or does not exist (`0`).

This means readers never block writers, and writers never block readers. Old versions of rows are cleaned up later by a background process called **VACUUM**.

### B. Isolation Levels & Concurrency Anomalies
SQL standard defines four isolation levels. They prevent different database anomalies:

| Isolation Level | Dirty Reads | Non-Repeatable Reads | Phantom Reads | Serialization Anomalies |
| :--- | :---: | :---: | :---: | :---: |
| **Read Uncommitted** | Allowed | Allowed | Allowed | Allowed |
| **Read Committed** *(Default)* | Prevented | Allowed | Allowed | Allowed |
| **Repeatable Read** | Prevented | Prevented | Prevented | Allowed |
| **Serializable** | Prevented | Prevented | Prevented | Prevented |

#### Key Anomalies:
* **Dirty Read**: Reading uncommitted data from another transaction.
* **Non-Repeatable Read**: Reading the same row twice in a transaction and getting different values because another transaction updated and committed it.
* **Phantom Read**: Reading a range of rows (e.g., `WHERE age > 20`), and a concurrent transaction inserts a *new* row matching the filter, making it appear in subsequent reads.
* **Write Skew (Serializable constraint violation)**: Two transactions read overlapping data, make decisions based on it, and write updates that violate a logical constraint (e.g., two doctors try to log off call simultaneously when at least one must remain active). Only **Serializable** isolation prevents this using dependency tracking locks.

---

## Module 2: Memory & Buffer Pool Management

Reading from disk is about 10,000 times slower than reading from RAM. The database uses a memory cache called the **Buffer Pool** to minimize disk I/O.

### A. The Buffer Pool Architecture
The Buffer Pool is an array of memory slots (frames), each matching the database page size (8 KB). The database maintains a **Page Table** in memory to map logical table pages to their active physical frames in RAM.

```
[ Disk Data Files ]  ──( Slow Read )──►  [ Buffer Pool (RAM) ]  ──►  [ Query Engine ]
                                                 │
                                                 ▼ (Modified pages)
                                         [ Dirty Pages ]  ──( Checkpoint )──► [ Disk ]
```

### B. Clock Sweep (Second Chance) Replacement Algorithm
When a page is requested but the Buffer Pool is full, the database must evict a page. PostgreSQL uses the **Clock Sweep** algorithm:
1. A pointer (hand) sweeps through the buffer frames sequentially.
2. Each frame has a **usage count** (frequency tracker).
3. If the hand finds a frame with a usage count > 0, it decrements the count by 1 and moves to the next.
4. If it finds a frame with a usage count of 0, that page is selected for eviction.
5. If the evicted page was modified in memory (marked as a **Dirty Page**), it must be written to disk before its frame can be reused.

### C. Checkpointing
Writing dirty pages to disk during eviction creates latency. To prevent this, a background process called the **Checkpointer** runs periodically. It flushes all dirty pages to disk and writes a `CHECKPOINT` marker to the WAL. In the event of a crash, the engine only needs to replay WAL logs starting from the last checkpoint.

---

## Module 3: Query Execution & Join Algorithms

When a query requests data from multiple tables (e.g., `FROM orders JOIN users`), the query planner selects one of three physical join algorithms:

```
1. Nested Loop Join          2. Hash Join                      3. Merge Join
    Outer Row                    Outer Table                       Outer Sorted
    ├──► Inner Row (Match?)      ├──► Hash Table (RAM)             ├──► Compare Pointer
    └──► Inner Row (Match?)      Inner Row ──► Probe Hash Table    └──► Compare Pointer
```

### A. Nested Loop Join
* **Mechanics**: For every row in the outer table, scan the inner table for matching rows.
* **When used**: Very fast for small tables, especially if the inner table has an index on the join key (Index Nested Loop).
* **Cost**: \(O(N \times M)\) where \(N\) and \(M\) are the table sizes.

### B. Hash Join
* **Mechanics**:
  1. **Build Phase**: Scan the smaller table, apply a hash function to the join key, and build a hash table in memory.
  2. **Probe Phase**: Scan the larger table, hash its join key, and probe the hash table for matches.
* **When used**: Highly efficient for large tables where there are no indexes on the join key. Requires enough RAM to hold the hash table.
* **Cost**: \(O(N + M)\) linear complexity.

### C. Sort-Merge Join
* **Mechanics**:
  1. Sort both tables on their join keys.
  2. Maintain pointers in both sorted sets and advance them in parallel to find matches.
* **When used**: Best when the tables are already sorted (e.g., due to an index) or for inequality joins (e.g., `ON a.id < b.id`).
* **Cost**: \(O(N \log N + M \log M)\) for sorting, then \(O(N + M)\) to merge.

---

## Module 4: B-Tree Index Internals & Splits

A B-Tree index is not static; it dynamically restructures itself as you insert data.

### A. Node/Page Splitting
A B-Tree node matches the database page size (8 KB). 
* **The Problem**: If a leaf node is full (e.g., contains 100 pointers) and you insert a new key that belongs in that node, it cannot fit.
* **The Solution (Page Split)**:
  1. The database creates a new, empty page.
  2. It moves approximately 50% of the elements from the old node to the new node.
  3. It inserts the new key into the appropriate half.
  4. It inserts a pointer to the new node in the parent directory node above.
  5. If the parent node is also full, the split propagates upward.

### B. Leaf Node Linkage
Leaf nodes in a B-Tree are connected via a doubly linked list (each leaf node has pointers to its immediate left and right neighbors).
* This design allows efficient **Range Queries** (e.g., `WHERE age BETWEEN 20 AND 30`). The database traverses the tree once to find the starting node (`20`), then follows the side pointers to retrieve subsequent records without navigating the tree again.

### C. Advanced Indexes: GIN and GiST
* **GIN (Generalized Inverted Index)**:
  - **How it works**: Instead of indexing rows, it indexes *components* of a row. For example, if a row contains the JSON `{"tags": ["pens", "blue"]}`, GIN creates separate index entries pointing to the same row under both the "pens" and "blue" entries.
  - **Use Case**: JSONB queries and full-text document searches.
* **GiST (Generalized Search Tree)**:
  - **How it works**: Organizes data in bounding box hierarchies (shapes within larger shapes).
  - **Use Case**: Geographic and spatial data (e.g., "Find all retail stores within 5km").
