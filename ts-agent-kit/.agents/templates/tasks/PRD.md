# <KEY>: <title>

## Meta

| Field | Value |
|---|---|
| KEY | `<KEY>` |
| Title | `<title>` |
| Status | `draft` |
| Domain | `docs/domains/<domain>.md` |
| Related systems | `<one line: front / API / CMS / external>` |

Status is `draft` until a human accepts this PRD. Then set `accepted`.

## 1. Problem

- **Who is hurt:** <actor or role>
- **What happens today:** <current behavior or workaround>
- **Why now:** <trigger for the change>

## 2. Solution

<What the user can do after the change that they cannot do today. Product outcome only. No Nest, Prisma, React, or deployment design.>

## 3. Out of scope

- <non-goal 1>
- <non-goal 2>

## 4. Actors / roles

| Id | Name | Goal | Permissions / constraints |
|---|---|---|---|
| A-01 | <role> | <goal> | <relevant limits> |

## 5. Use cases

### UC-01: <name>

- **Actor:** A-01
- **Precondition:** <state that must already be true>
- **Trigger:** <what starts the case>
- **Main flow:**
  1. <step>
  2. <step>
- **Alternate / exception flows:**
  - <condition> → <outcome>
- **Postcondition:** <observable end state>

### UC-02: <name>

- **Actor:** A-01
- **Precondition:**
- **Trigger:**
- **Main flow:**
  1.
- **Alternate / exception flows:**
  -
- **Postcondition:**

## 6. Functional requirements

| Id | Requirement | Use cases |
|---|---|---|
| FR-01 | The system SHALL <action>. | UC-01 |
| FR-02 | The system SHALL <action>. | UC-01, UC-02 |

## 7. Non-functional requirements

Omit this section unless the human stated measurable targets.

| Id | Requirement | Source |
|---|---|---|
| NFR-01 | <measurable target> | <human / ticket> |

## 8. Acceptance / definition of done

Observable checks a human can verify without reading code:

- [ ] <check tied to UC-01 / FR-01>
- [ ] <check tied to an unwanted or exception path>

## 9. Open questions

Empty before status becomes `accepted`.

- <question, or delete this bullet when none remain>

## 10. Traceability

| FR | UC | EARS (later) |
|---|---|---|
| FR-01 | UC-01 | |
| FR-02 | UC-01, UC-02 | |
