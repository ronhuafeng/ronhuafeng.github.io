---------------------------- MODULE StaleCallback ----------------------------
EXTENDS Naturals

CONSTANTS Ops,             \* 可能并发的异步操作
          MaxIncarnation,  \* worker-A 最多被重建到第几代
          CheckIncarnation \* Commit 是否校验 incarnation

VARIABLES incarnation,  \* worker-A 当前是第几代实体
          opPhase,      \* 每个操作所处阶段
          opBinding,    \* 每个操作启动时绑定的 incarnation
          lastWriter    \* 当前资源上最后一次写入来自哪一代的操作，0 表示尚无写入

vars == <<incarnation, opPhase, opBinding, lastWriter>>

TypeOK ==
  /\ incarnation \in 1..MaxIncarnation
  /\ opPhase \in [Ops -> {"idle", "running", "done", "committed", "discarded"}]
  /\ opBinding \in [Ops -> 0..MaxIncarnation]
  /\ lastWriter \in 0..MaxIncarnation

Init ==
  /\ incarnation = 1
  /\ opPhase = [o \in Ops |-> "idle"]
  /\ opBinding = [o \in Ops |-> 0]
  /\ lastWriter = 0

StartOp(o) ==            \* 操作启动，记下此刻的 incarnation
  /\ opPhase[o] = "idle"
  /\ opPhase' = [opPhase EXCEPT ![o] = "running"]
  /\ opBinding' = [opBinding EXCEPT ![o] = incarnation]
  /\ UNCHANGED <<incarnation, lastWriter>>

Replace ==               \* 删除并重建 worker-A：名字不变，换一代实体
  /\ incarnation < MaxIncarnation
  /\ incarnation' = incarnation + 1
  /\ lastWriter' = 0
  /\ UNCHANGED <<opPhase, opBinding>>

Complete(o) ==           \* 异步结果返回
  /\ opPhase[o] = "running"
  /\ opPhase' = [opPhase EXCEPT ![o] = "done"]
  /\ UNCHANGED <<incarnation, opBinding, lastWriter>>

Commit(o) ==             \* 把结果写入当前叫 worker-A 的资源
  /\ opPhase[o] = "done"
  /\ CheckIncarnation => opBinding[o] = incarnation
  /\ opPhase' = [opPhase EXCEPT ![o] = "committed"]
  /\ lastWriter' = opBinding[o]
  /\ UNCHANGED <<incarnation, opBinding>>

Discard(o) ==            \* 丢弃已经过期的结果
  /\ opPhase[o] = "done"
  /\ opBinding[o] # incarnation
  /\ opPhase' = [opPhase EXCEPT ![o] = "discarded"]
  /\ UNCHANGED <<incarnation, opBinding, lastWriter>>

Next ==
  \/ Replace
  \/ \E o \in Ops : StartOp(o) \/ Complete(o) \/ Commit(o) \/ Discard(o)

Spec == Init /\ [][Next]_vars

\* 资源上的最后一次写入，只能来自绑定当前 incarnation 的操作
NoStaleWrite == lastWriter \in {0, incarnation}
=============================================================================
