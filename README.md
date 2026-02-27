# opencode-fastedit

A high-performance line-based editing plugin for [OpenCode](https://opencode.ai) that replaces ranges of lines by line number instead of requiring exact string matching.

## Features

- **Line-number based editing** - Specify start and end line numbers instead of matching exact text
- **Efficient multi-line edits** - Replace, delete, or insert multiple lines at once
- **Native diff display** - Shows diff output with change statistics
- **TypeScript support** - Full type definitions included

## Installation

Add to your `opencode.json`:

```json
{
  "plugins": ["opencode-fastedit"]
}
```

## Usage

The `fastedit` tool replaces a range of lines in a file with new code.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_path` | string | Yes | Absolute path to the file to modify |
| `start_line` | number | Yes | Starting line number (1-indexed) |
| `end_line` | number | Yes | Ending line number (inclusive) |
| `new_code` | string | Yes | Code to insert (empty string to delete only) |

### Examples

```typescript
// Replace lines 10-20 with new code
fastedit({
  file_path: "/path/to/file.ts",
  start_line: 10,
  end_line: 20,
  new_code: "const newFunction = () => {\n  return 'hello';\n};"
})

// Delete lines 5-10 (empty new_code)
fastedit({
  file_path: "/path/to/file.ts",
  start_line: 5,
  end_line: 10,
  new_code: ""
})

// Insert at line 5 (replace zero-length range)
fastedit({
  file_path: "/path/to/file.ts",
  start_line: 5,
  end_line: 4,
  new_code: "// This comment was inserted before original line 5"
})
```

## Behavior

- **Replaces** all lines from `start_line` to `end_line` (inclusive) with `new_code`
- If `new_code` is empty, the lines are simply deleted
- Uses 1-indexed line numbers (matching the `view` tool output)
- Generates a unified diff showing changes

## Diff Display

The pretty diff UI (colored green/red with split/unified views) requires OpenCode to include a fix for preserving plugin metadata.

**Tracking Issue**: [anomalyco/opencode#12527](https://github.com/anomalyco/opencode/issues/12527)

Once resolved, plugin tools will be able to display diffs in the same rich format as built-in tools.

## License

MIT

## Related

- [OpenCode](https://opencode.ai) - The AI coding agent