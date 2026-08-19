// DetailsPanel: close button + the selected call's args and
// result — args as JSON, the result raw except for a terminal-card call, whose
// Output section is the command's terminal card. Reads the
// selection from the shared chat
// store (conversation writes, this panel reads — the cross-registration
// share the store seat exists for) and derives the call material from the
// session snapshot — no data of its own.

import { Fragment } from 'react'
import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import { shallowEqual } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationSnapshot, RunningToolCall, ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { ChatStore, DetailsSlotProps } from '../contract/slots.ts'
import { findToolCall } from '../chat/tool-node-reader.ts'
import css from './DetailsPanel.module.css'

/** Full props composed by reference from the contract (automatic shares & injected share). */
export type DetailsPanelProps = DetailsSlotProps

/**
 * Selected call material: the call's display name and args plus the frozen
 * block slice it came from. `block` is a snapshot-cached reference, so the
 * wrapper stays shallow-equal across unrelated snapshot frames; the settled /
 * running split is read off it with the `'kind' in block` discrimination
 * instead of duplicated as flags.
 */
interface CallMaterial {
  name: string
  argsRaw: string | null
  block: ToolCallBlock
}

/** Material of a settled result node (native call or run_code sub-dispatch). */
function settledMaterial(node: ToolResultNode, callId: string): CallMaterial {
  return { name: node.call?.name ?? callId, argsRaw: node.call?.argsRaw ?? null, block: node }
}

/** Material of an in-flight call (native call or run_code sub-dispatch). */
function runningMaterial(call: RunningToolCall): CallMaterial {
  return { name: call.name, argsRaw: call.argsRaw, block: call }
}

function materialFor(s: ConversationSnapshot, callId: string): CallMaterial | null {
  const found = findToolCall(s, callId)
  if (found === undefined) return null
  return 'kind' in found ? settledMaterial(found, callId) : runningMaterial(found)
}

function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    // Not JSON (streaming fragment or plain text): show verbatim.
    return raw
  }
}

/** Flatten a settled result for the no-ui-tool fallback. */
function rawResultText(block: ToolCallBlock): string {
  if (!('kind' in block)) return ''
  const parts = block.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  if (parts.length === 0 && block.error !== undefined) parts.push(`${block.error.name}: ${block.error.code}`)
  return parts.join('\n')
}

export function DetailsPanel({
  SessionProvider,
  useSession,
  useSessions,
  sessionId,
  useStore,
  actions,
  renderSlot,
  closeDetails,
  viewTabs,
  t,
}: DetailsPanelProps) {
  const selection = useStore(s => s.selection)
  const activeView = useStore(s => s.detailsView)
  const callId = selection?.callId
  // materialFor builds a fresh wrapper; shallowEqual short-circuits on its
  // stable members (result node reference rides the snapshot's structural sharing).
  const material = useSession(
    s => (callId === undefined ? null : materialFor(s, callId)),
    (a, b) => shallowEqual(a, b))
  const tabs = viewTabs?.() ?? [{ id: 'tool', label: t('details.tool') }]
  const selectedView = tabs.some(tab => tab.id === activeView) ? activeView : tabs[0]?.id ?? 'tool'
  const title = selectedView === 'tool'
    ? material?.name ?? t('details.title')
    : tabs.find(tab => tab.id === selectedView)?.label ?? selectedView

  return (
    <div className={css.root}>
      <div className={css.header}>
        <div className={css.title}>{title}</div>
        <button
          type="button" className={css.close} aria-label={t('details.close')}
          onClick={() => { closeDetails() }}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className={css.tabs} role="tablist" aria-label={t('details.tabs')}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === selectedView}
            className={css.tab}
            data-active={tab.id === selectedView || undefined}
            onClick={() => { actions.setDetailsView(tab.id) }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={css.body}>
        {selectedView === 'tool'
          ? <DetailsToolView
            activeView={selectedView}
            SessionProvider={SessionProvider}
            useSession={useSession}
            useSessions={useSessions}
            sessionId={sessionId}
            useStore={useStore}
            actions={actions}
            renderSlot={renderSlot}
            t={t}
          />
          : renderSlot('conversation.details.view', {
            activeView: selectedView,
            onSelectView: (id) => { actions.setDetailsView(id) },
          }, { fallback: <div className={css.empty}>{t('details.empty')}</div> })}
      </div>
    </div>
  )
}

/** Props of the built-in details tab that delegates the selected block to Tool UI. */
type DetailsToolViewProps = Pick<
  PropsRuntime<'conversation.details.view'>,
  'activeView' | 'useSession' | 'useSessions' | 'sessionId'
>
  & PropsRenderSlots<'conversation.details.tool'>
  & PropsStore<ChatStore>
  & PropsLocale<'conversation'>

/** Built-in `tool` tab; its store handle is shared with the details shell. */
export function DetailsToolView({ activeView, useSession, useSessions, sessionId, useStore, renderSlot, t }: DetailsToolViewProps) {
  const selection = useStore(s => s.selection)
  const callId = selection?.callId
  const sessionCwd = useSessions(list => list.byId[sessionId]?.cwd)
  const material = useSession(
    s => (callId === undefined ? null : materialFor(s, callId)),
    (a, b) => shallowEqual(a, b))

  if (selection === null || callId === undefined) {
    return (
      <div className={css.view} data-active={activeView === 'tool' || undefined}>
        <div className={css.empty}>{t('details.empty')}</div>
      </div>
    )
  }
  if (material === null) {
    return (
      <div className={css.view} data-active={activeView === 'tool' || undefined}>
        <div className={css.empty}>{t('details.notInWindow')}</div>
      </div>
    )
  }

  return (
    <div className={css.view} data-active={activeView === 'tool' || undefined}>
      {material.argsRaw !== null && (
        <section className={css.section}>
          <div className={css.sectionLabel}>{t('details.input')}</div>
          <CodeBlock code={pretty(material.argsRaw)} lang="json" copyLabel={t('copy')} copiedLabel={t('copied')} />
        </section>
      )}
      <section className={css.section}>
        <div className={css.sectionLabel}>{t('details.output')}</div>
        {/* Keyed by the selected call so renderer-local state cannot bleed between calls. */}
        <Fragment key={callId}>
          {renderSlot('conversation.details.tool', { block: material.block, cwd: sessionCwd }, {
            fallback: 'kind' in material.block
              ? (
                <pre className={css.code} data-error={material.block.isError || undefined}>
                  {rawResultText(material.block)}
                </pre>
              )
              : <div className={css.empty}>{t('details.running')}</div>,
          })}
        </Fragment>
      </section>
    </div>
  )
}
