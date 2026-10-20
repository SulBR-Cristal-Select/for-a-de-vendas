import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import WorkspaceRoot from '../sul/WorkspaceRoot';

export const Route = createFileRoute('/')({ component: Index });

function Index() {
  return <ClientOnly fallback={null}><WorkspaceRoot /></ClientOnly>;
}
