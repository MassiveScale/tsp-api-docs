/**
 * @module property-details
 *
 * Describes the rules a property's value must follow — default, visibility,
 * deprecation, `@secret`, `@format`, length, pattern, range, item count, and
 * wire encoding — as short sentences for the Summary column of property and
 * parameter tables. A reader learns the rules from the docs rather than from a
 * `400 Bad Request`.
 */

import {
  getDeprecated,
  getFormat,
  getMaxItems,
  getMaxLength,
  getMaxValue,
  getMaxValueExclusive,
  getMinItems,
  getMinLength,
  getMinValue,
  getMinValueExclusive,
  getPattern,
  isSecret,
  type ModelProperty,
  type Program,
  type Scalar,
  type Type,
} from "@typespec/compiler";
import { isVisible, Visibility } from "@typespec/http";
import { constraint, defaultValueJson, resolveEncode } from "./type-ref.js";
import { FALLBACK_SUMMARY } from "./utils.js";

/** A property or parameter, or a scalar described on its own type page. */
export type RuleTarget = ModelProperty | Scalar;

/**
 * Returns the sentences describing a property's rules, e.g.
 * ``"Read-only. Default: `5`. Minimum 0, maximum 100."``, or `undefined` when
 * none apply.
 *
 * @param program - The TypeSpec program.
 * @param property - The model property or operation parameter, or a scalar
 *   (whose own constraints are described on its type page).
 * @param options - `visibility: false` leaves out read-only / write-only notes,
 *   which only make sense for model properties, not for parameters.
 */
export function describePropertyRules(
  program: Program,
  property: RuleTarget,
  options: { visibility?: boolean } = {},
): string | undefined {
  const sentences = [
    deprecationNote(program, property),
    options.visibility === false
      ? undefined
      : visibilityNote(program, property),
    defaultNote(program, property),
    formatNote(program, property),
    lengthNote(program, property),
    patternNote(program, property),
    rangeNote(program, property),
    itemsNote(program, property),
    encodingNote(program, property),
    secretNote(program, property),
  ].filter((sentence): sentence is string => sentence !== undefined);
  return sentences.length > 0 ? sentences.join(" ") : undefined;
}

/**
 * Combines a summary and rule sentences into the text of a Summary cell.
 * Falls back to {@link FALLBACK_SUMMARY} only when there is neither.
 *
 * @param summary - The property's own summary, or a generated one.
 * @param rules - Sentences from {@link describePropertyRules}, if any.
 */
export function composeDescription(
  summary: string | undefined,
  rules: string | undefined,
): string {
  if (!summary) return rules ?? FALLBACK_SUMMARY;
  if (!rules) return summary;
  const trimmed = summary.trim();
  return `${/[.!?:]$/u.test(trimmed) ? trimmed : `${trimmed}.`} ${rules}`;
}

/**
 * Reads a constraint from the property, then from its scalar type's chain.
 *
 * @param program - The TypeSpec program.
 * @param property - The property, or a scalar for its own type page.
 * @param read - The compiler accessor for the constraint.
 */
function lookup<T>(
  program: Program,
  property: RuleTarget,
  read: (program: Program, target: Type) => T | undefined,
): T | undefined {
  if (property.kind === "Scalar") {
    return constraint(program, property, undefined, read);
  }
  return property.type.kind === "Scalar"
    ? constraint(program, property.type, property, read)
    : read(program, property);
}

/** Returns `value` when it is above zero, otherwise `undefined`. */
function positive(value: number | undefined): number | undefined {
  return value !== undefined && value > 0 ? value : undefined;
}

/** Wraps `value` in a Markdown code span, widening the fence if needed. */
function code(value: string): string {
  return value.includes("`") ? `\`\` ${value} \`\`` : `\`${value}\``;
}

/** Capitalizes the first letter of a sentence. */
function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/**
 * Notes a `#deprecated` property, with its message.
 *
 * @param program - The TypeSpec program.
 * @param property - The property, or a scalar for its own type page.
 */
function deprecationNote(
  program: Program,
  property: RuleTarget,
): string | undefined {
  if (property.kind !== "ModelProperty") return undefined;
  const message = getDeprecated(program, property);
  if (message === undefined) return undefined;
  return message
    ? `Deprecated: ${message.replace(/\.$/u, "")}.`
    : "Deprecated.";
}

/**
 * Notes a property that is read-only, write-only, or immutable after
 * creation, from its `@visibility` (lifecycle) settings.
 *
 * @param program - The TypeSpec program.
 * @param property - The property, or a scalar for its own type page.
 */
function visibilityNote(
  program: Program,
  property: RuleTarget,
): string | undefined {
  if (property.kind !== "ModelProperty") return undefined;
  const read = isVisible(program, property, Visibility.Read);
  const create = isVisible(program, property, Visibility.Create);
  const update = isVisible(program, property, Visibility.Update);
  if (read && !create && !update) return "Read-only.";
  if (!read && (create || update)) return "Write-only; never returned.";
  if (read && create && !update) return "Set on create; can't be changed.";
  return undefined;
}

/**
 * Notes the property's declared default value, as JSON in its wire encoding
 * (the same value examples show; see `defaultValueJson`).
 *
 * @param program - The TypeSpec program.
 * @param property - The property, or a scalar for its own type page.
 */
function defaultNote(
  program: Program,
  property: RuleTarget,
): string | undefined {
  if (property.kind !== "ModelProperty") return undefined;
  const value = defaultValueJson(program, property);
  return value === undefined
    ? undefined
    : `Default: ${code(JSON.stringify(value))}.`;
}

/**
 * Notes the property's `@format`.
 *
 * @param program - The TypeSpec program.
 * @param property - The property, or a scalar for its own type page.
 */
function formatNote(
  program: Program,
  property: RuleTarget,
): string | undefined {
  const format = lookup(program, property, getFormat);
  return format ? `Format: ${code(format)}.` : undefined;
}

/**
 * Notes `@minLength` / `@maxLength`.
 *
 * @param program - The TypeSpec program.
 * @param property - The property, or a scalar for its own type page.
 */
function lengthNote(
  program: Program,
  property: RuleTarget,
): string | undefined {
  // A minimum of zero says nothing, so it is left out.
  const min = positive(lookup(program, property, getMinLength));
  const max = lookup(program, property, getMaxLength);
  if (min !== undefined && max !== undefined) {
    return min === max
      ? `Exactly ${min} characters.`
      : `${min} to ${max} characters.`;
  }
  if (min !== undefined) return `At least ${min} characters.`;
  if (max !== undefined) return `At most ${max} characters.`;
  return undefined;
}

/**
 * Notes `@pattern`.
 *
 * @param program - The TypeSpec program.
 * @param property - The property, or a scalar for its own type page.
 */
function patternNote(
  program: Program,
  property: RuleTarget,
): string | undefined {
  const pattern = lookup(program, property, getPattern);
  return pattern ? `Must match ${code(pattern)}.` : undefined;
}

/**
 * Notes `@minValue` / `@maxValue` and their exclusive forms.
 *
 * @param program - The TypeSpec program.
 * @param property - The property, or a scalar for its own type page.
 */
function rangeNote(program: Program, property: RuleTarget): string | undefined {
  const parts = [
    bound("minimum", lookup(program, property, getMinValue)),
    bound("greater than", lookup(program, property, getMinValueExclusive)),
    bound("maximum", lookup(program, property, getMaxValue)),
    bound("less than", lookup(program, property, getMaxValueExclusive)),
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? sentence(parts.join(", ")) : undefined;
}

/** Formats one numeric bound, e.g. `"minimum 0"`. */
function bound(label: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${label} ${value}`;
}

/**
 * Notes `@minItems` / `@maxItems` on an array property.
 *
 * @param program - The TypeSpec program.
 * @param property - The property, or a scalar for its own type page.
 */
function itemsNote(program: Program, property: RuleTarget): string | undefined {
  if (property.kind !== "ModelProperty") return undefined;
  const min = positive(getMinItems(program, property));
  const max = getMaxItems(program, property);
  if (min !== undefined && max !== undefined) {
    return min === max ? `Exactly ${min} items.` : `${min} to ${max} items.`;
  }
  if (min !== undefined)
    return `At least ${min} ${min === 1 ? "item" : "items"}.`;
  if (max !== undefined)
    return `At most ${max} ${max === 1 ? "item" : "items"}.`;
  return undefined;
}

/**
 * Notes an `@encode` that changes the wire form, e.g. `rfc7231` for a
 * `utcDateTime` or `seconds` (`int32`) for a `duration`.
 *
 * @param program - The TypeSpec program.
 * @param property - The property, or a scalar for its own type page.
 */
function encodingNote(
  program: Program,
  property: RuleTarget,
): string | undefined {
  const encode =
    property.kind === "Scalar"
      ? resolveEncode(program, property, undefined)
      : property.type.kind === "Scalar"
        ? resolveEncode(program, property.type, property)
        : undefined;
  if (!encode) return undefined;
  const target = encode.type?.name;
  if (!encode.encoding) {
    return target ? `Sent as ${code(target)}.` : undefined;
  }
  return target && target !== "string"
    ? `Encoded as ${code(encode.encoding)} (${code(target)}).`
    : `Encoded as ${code(encode.encoding)}.`;
}

/**
 * Notes a `@secret` property, or one whose scalar type is `@secret`.
 *
 * @param program - The TypeSpec program.
 * @param property - The property, or a scalar for its own type page.
 */
function secretNote(
  program: Program,
  property: RuleTarget,
): string | undefined {
  const scalar = property.kind === "Scalar" ? property : property.type;
  const secret =
    isSecret(program, property) ||
    (scalar.kind === "Scalar" &&
      constraint(program, scalar, undefined, (p, target) =>
        isSecret(p, target) ? true : undefined,
      ) === true);
  return secret ? "Sensitive: treat as a secret." : undefined;
}
