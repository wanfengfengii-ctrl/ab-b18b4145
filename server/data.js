// 内置的确定性质粒记录：每次进程启动都完全一致。
// referenceStart 固定为 0，代表实验室登记序列的参考起点；显示旋转不会改变它。
// 注释坐标一律为零基起点 + 正整数长度（允许跨越末端，length 不得等于序列全长）。
// kind: annotation = 既有注释；fragment = 待验证片段。
export const PLASMID = {
  name: "pVERIFY-1",
  length: 5400,
  circular: true,
  referenceStart: 0,
  annotations: [
    { name: "ori",        start: 100,  length: 250,  kind: "annotation" },
    { name: "ampR",       start: 1200, length: 860,  kind: "annotation" },
    { name: "Plac",       start: 3000, length: 80,   kind: "annotation" },
    { name: "MCS",        start: 3050, length: 45,   kind: "annotation" },
    { name: "lacZ'",      start: 3100, length: 1000, kind: "annotation" },
    { name: "terminator", start: 4700, length: 48,   kind: "annotation" }
  ]
};
