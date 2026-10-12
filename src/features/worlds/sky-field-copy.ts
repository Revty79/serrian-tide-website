export const skyCycleQuestions = {
  enabled: "Add an optional structured model",
  scale: "Which kind of time should this model use?",
  unit: "Which unit measures this pattern?",
  period: "How often does this happen?",
  anchorMethod: "When should this cycle start counting from?",
  anchor: "What is the starting position?",
  approximate: "Label this model and its projections as approximate",
  offset: "Should this pattern begin partway through its cycle?",
  window: "How long does an occurrence last?",
  beginning: "From what position does this model apply?",
  ending: "Through what position does this model apply?",
} as const;
export const skyPhaseQuestions = (index: number) => ({ name: `What is phase ${index + 1} called?`, duration: `How long does phase ${index + 1} last?`, description: `What is phase ${index + 1} like?` });
export const skyBindingQuestions = (index: number) => ({ version: `Which calendar is association ${index + 1} connected to?`, role: `What does this sky connection mean for calendar ${index + 1}?`, account: `Who describes calendar connection ${index + 1}, and how?` });
