import type { EngineInterface, Register } from 'claude-code'

// Tools whose successful call means "code changed".
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])
const QUIZ_TOOL = 'AskUserQuestion'
const COMMAND = 'quiz'
const ENABLED_KEY = 'enabled'

// Files changed since the last quiz, and whether this turn already got the
// mid-turn reminder. Module variables start over on a reload, which at worst
// skips one quiz.
const changed = new Set<string>()
let isReminded = false

const isEnabled = async ($: EngineInterface) => (await $.store.get(ENABLED_KEY)) !== false

const pathOf = (input: unknown): string | undefined => {
  if (typeof input !== 'object' || input === null) return undefined
  const rec = input as Record<string, unknown>
  const p = rec.file_path ?? rec.notebook_path
  return typeof p === 'string' ? p : undefined
}

const HOW = `1. Call AskUserQuestion ONCE with 2-4 questions about the change. Mix the formats:
   - at least one single-choice question (multiSelect: false),
   - at least one checkbox question (multiSelect: true) where more than one option is correct,
   - the user can always type a free-text answer via "Other"; for one question, make the options deliberately incomplete so explaining in their own words is the best answer.
2. Aim at understanding and judgment, not trivia. Good angles: why this approach over an alternative; what breaks if a specific line/condition is removed; predicting behavior for an edge-case input; trade-offs (performance, readability, coupling, testability); how they would verify it works; what risk or follow-up the change leaves open.
3. Make every distractor plausible. Do NOT mark the correct answer, add "(Recommended)", or hint at it in labels or descriptions. Keep each question self-contained (name the file/function it is about).
4. After the user answers, give short feedback per question: correct / partly / incorrect, the reasoning, and the misconception if any. Point to file:line where useful. End with one sentence on what to look at next.
5. Do not edit any files during the quiz. If an answer exposes a real problem in the change, say so and propose a fix, but wait for the user's go-ahead.
If the user skips or dismisses the questions, accept that and end the turn without asking again.`

const atStop = (files: string[]) => `[comprehension-check] You changed code this turn. Before ending, quiz the user on it to check their understanding and build critical thinking.

Files changed: ${files.map(f => `\n- ${f}`).join('')}

Do this now:
${HOW}`

const midTurn = `[comprehension-check] The user has enabled comprehension quizzes. You have started changing code in this turn. Keep working on the task as normal; once ALL the code changes for this request are done, and before you end your turn, quiz the user on what you changed:
${HOW}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Comprehension quiz after code changes: on | off | status',
      argumentHint: 'on|off|status',
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      await $.store.set(ENABLED_KEY, arg === 'on')
      if (arg === 'off') changed.clear()
      return { text: `Comprehension quiz ${arg === 'on' ? 'enabled' : 'disabled'}.` }
    }
    const isOn = await isEnabled($)
    return {
      text: `Comprehension quiz is ${isOn ? 'on' : 'off'}. Use /${COMMAND} on or /${COMMAND} off.`,
    }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) isReminded = false
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const isOk = ran.deny === undefined && ran.isError !== true
    if (!isOk) return ran

    if (e.tool === QUIZ_TOOL && e.agentId === undefined) {
      // The quiz happened: nothing is owed until the next edit.
      changed.clear()
      return ran
    }

    if (EDIT_TOOLS.has(e.tool)) {
      const p = pathOf(e)
      if (p !== undefined) changed.add(p)
      if (!isReminded && (await isEnabled($))) {
        isReminded = true
        // Reaches the model at the loop's next step, even where a policy
        // plugin above passes over this mod's Stop hook.
        await $.session.append({
          message: { type: 'user', content: [{ type: 'text', text: midTurn }] },
        })
      }
    }
    return ran
  })

  on('classic.Stop', async ($, e, next) => {
    const result = await next(e)
    // Someone else is already sending Claude back, or this is the stop after
    // our own push: let it end.
    if (result.block !== undefined || e.stop_hook_active) return result
    if (changed.size === 0) return result
    const files = [...changed]
    changed.clear()
    if (!(await isEnabled($))) return result
    return { ...result, block: atStop(files) }
  })
}
