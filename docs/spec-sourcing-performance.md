# Spec: Sourcing Performance Dashboard

## Objective
Provide a dedicated view/tab in the main Dashboard page (`/dashboard`) to visualize and evaluate the performance of each sourcing account (agent). Sourcing managers (Admins/Bosses) and agents themselves need to track productivity, bid efficiency, and supplier quality metrics.

### Key Features
1. **Performance View Tab**: Add a new option "Sourcing Performance" to the view mode switcher on the main Dashboard page, next to "Analytics" and "Kanban Board".
2. **Key Performance Indicators (KPIs)**:
   - **Total Sourced Suppliers**: Total suppliers registered by the agent.
   - **Total Bids Submitted**: Bids linked to orders/order items.
   - **Bids Shortlisted**: Bids selected as shortlisted (`is_shortlisted = true`).
   - **Shortlist Conversion Rate**: Percentage of bids that got shortlisted.
   - **Average Supplier Reliability**: Average reliability score of suppliers sourced by the agent.
3. **Agent Leaderboard / Comparison Table**:
   - Compare all sourcing agents side-by-side.
   - Sortable by any metric (Total Sourced, Bids, Conversion Rate, etc.).
   - Search by agent email/username.
4. **Visual Analytics (Charts)**:
   - Bar chart comparing agent activity (Suppliers sourced vs Bids submitted).
   - Radial or pie chart for shortlist success rates.
5. **Agent Detail Panel / View**:
   - Interactive drilldown: clicking on an agent displays their performance details and a list of suppliers they've sourced.

## Tech Stack
- Next.js (App Router, React 19)
- Tailwind CSS & Shadcn UI
- Lucide React (Icons)
- Recharts (Data Visualizations)
- Supabase (Database queries on `suppliers`, `order_suppliers`, `profiles`)

## Commands
- Dev Server: `npm run dev`
- Build production: `npm run build`
- Type Check: `npm run type-check`
- Lint Code: `npm run lint`
- Run Tests: `npm run test`

## Project Structure
- `src/app/(dashboard)/dashboard/dashboard-client.tsx` (Add performance view entry and render `SourcingPerformance`)
- `src/app/(dashboard)/dashboard/components/sourcing-performance.tsx` [NEW] (Sourcing Performance Component)
- `src/app/(dashboard)/dashboard/components/sourcing-performance.test.tsx` [NEW] (Unit tests for the performance calculations)
- `src/app/(dashboard)/dashboard/page.tsx` (Fetch master suppliers data and update order_suppliers query to fetch agent columns)

## Code Style
- **TypeScript**: Strictly typed interfaces and functional components.
- **Tailwind CSS**: Use premium, modern variables and smooth transition classes (e.g. `duration-300`, `transition-all`).
- **Data aggregation**: Perform client-side data processing and grouping to minimize database load.
- Example:
```typescript
interface AgentPerformanceMetrics {
  agentEmail: string;
  agentName: string;
  totalSuppliers: number;
  totalBids: number;
  shortlistedBids: number;
  shortlistRate: number;
  avgLeadTime: number;
  avgQuotedPrice: number;
  avgReliability: number;
}
```

## Testing Strategy
- Framework: Vitest + Testing Library React
- Create unit tests verifying that data is aggregated correctly for each agent.
- Ensure empty states are gracefully handled when no agents/suppliers are present.
- Test sorting and searching interactions on the agent comparison grid.

## Boundaries
- **Always**: Keep code clean, perform all calculations safely, support both light and dark modes.
- **Ask first**: If we need to write new API endpoints (currently planning client-side calculations based on suppliers list).
- **Never**: Hardcode specific agent names/emails; must be dynamically fetched from current database profiles or `created_by` values.

## Success Criteria
- [ ] Users can access a "Sourcing Performance" option from the main dashboard switcher.
- [ ] The dashboard renders KPI cards, comparative charts, and a detailed comparison table.
- [ ] Clicking on an agent opens a detailed drilldown list showing their sourced suppliers and bids.
- [ ] The tab is fully responsive, supports dark mode, and loads instantly.
- [ ] Vitest unit tests for the performance calculations pass successfully.
