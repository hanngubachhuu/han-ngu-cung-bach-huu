# DATA CONTRACT — HÁN NGỮ CÙNG BÁCH HỮU

Tài liệu này là ranh giới kiểm soát dữ liệu. Không điền tên bảng hoặc field nếu chưa xác minh.

## Required trace

Every important data path must be traceable:

SOURCE
→ IDENTITY
→ TRANSFORMATION
→ DESTINATION
→ CONSUMER
→ ACCESS CONTROL
→ VERIFICATION

## Current conceptual domains

| Domain | Current conceptual owner | Must verify |
|---|---|---|
| Lesson manifest | repository canonical manifest | exact file + consumer |
| Lesson content | canonical lesson data / backend for private content | exact source and visibility |
| Student account | Supabase/Auth boundary | exact tables/owner key |
| Lesson entitlement | Supabase/access model | exact policy and relation |
| Progress/submission | persistence layer | exact owner and payload |
| Google Docs profile data | Google Docs + server sync | exact fields and direction |
| Private media | Supabase Private Storage | bucket + policy + signed/authenticated path |
| Public build | build pipeline | exact allowlist |

## Access-state separation

- account exists
- authenticated
- approved
- entitled to lesson
- lesson published/available
- UI displays lesson

A discrepancy can occur at any boundary.

## Source-of-truth rules

1. One canonical owner per concept.
2. No silent key renames.
3. Missing UI data does not prove missing database data.
4. Sync conflict must be diagnosed before overwrite.
5. Preserve stable IDs.
6. Data migrations must have rollback/verification reasoning.

## Google Docs checklist

- source
- destination
- direction
- matching key
- fields allowed
- conflict behavior
- duplicate behavior
- missing record behavior
- retry
- error classification
- last verified sync

## Supabase checklist

- schema inspected
- RLS inspected
- owner key identified
- service/client boundary identified
- representative query verified
- migration impact recorded

## Lesson checklist

- lesson ID
- lessonNo
- level
- visibility
- href/route
- data source
- renderer
- exercise/question shape
- completion/submission
- entitlement check
