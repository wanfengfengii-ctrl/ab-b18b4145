// 注释集合校验。PUT 必须整集合通过后才提交，任何一条非法都返回稳定错误码且不动既有数据。
//
// 稳定错误码：
//   INVALID_PAYLOAD    请求体不是 { annotations: [...] }
//   INVALID_ANNOTATION 元素不是对象
//   EMPTY_NAME         名称缺失或为空白
//   INVALID_COORDINATES start 不是 [0, length-1] 内的整数
//   EMPTY_FRAGMENT     length < 1（空片段）
//   FULL_CIRCLE        length >= 序列长度（覆盖整圈）
//   DUPLICATE_NAME     名称（去空白后）重复

export function validationError(code, message) {
  return { error: { code, message } };
}

export function validateAnnotations(input, seqLen) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return validationError("INVALID_PAYLOAD", "请求体必须是包含 annotations 数组的对象");
  }
  const { annotations } = input;
  if (!Array.isArray(annotations)) {
    return validationError("INVALID_PAYLOAD", "annotations 必须是数组");
  }

  const seen = new Set();
  const cleaned = [];

  for (let i = 0; i < annotations.length; i++) {
    const item = annotations[i];
    const where = `第 ${i + 1} 条注释`;
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return validationError("INVALID_ANNOTATION", `${where}不是有效的注释对象`);
    }

    const { name, start, length, kind } = item;
    if (typeof name !== "string" || name.trim().length === 0) {
      return validationError("EMPTY_NAME", `${where}名称为空`);
    }
    const trimmedName = name.trim();
    if (seen.has(trimmedName)) {
      return validationError("DUPLICATE_NAME", `注释名称重复：${trimmedName}`);
    }
    // kind 可选：既有注释 annotation，或待验证片段 fragment；默认 annotation。
    const normalizedKind = kind === undefined ? "annotation" : kind;
    if (normalizedKind !== "annotation" && normalizedKind !== "fragment") {
      return validationError("INVALID_ANNOTATION", `${where}（${trimmedName}）kind 只能是 annotation 或 fragment`);
    }

    if (!Number.isInteger(start) || !Number.isInteger(length)) {
      return validationError("INVALID_COORDINATES", `${where}（${trimmedName}）坐标必须是整数`);
    }
    if (!(start >= 0 && start < seqLen)) {
      return validationError(
        "INVALID_COORDINATES",
        `${where}（${trimmedName}）起点 ${start} 超出范围 [0, ${seqLen - 1}]`
      );
    }
    if (length < 1) {
      return validationError("EMPTY_FRAGMENT", `${where}（${trimmedName}）长度必须为正整数`);
    }
    if (length >= seqLen) {
      return validationError("FULL_CIRCLE", `${where}（${trimmedName}）不得覆盖整圈`);
    }

    seen.add(trimmedName);
    cleaned.push({ name: trimmedName, start, length, kind: normalizedKind });
  }

  return { value: cleaned };
}
