import _ from 'underscore';
import { diffModes } from '~/ide/constants';
import {
  LINE_POSITION_LEFT,
  LINE_POSITION_RIGHT,
  TEXT_DIFF_POSITION_TYPE,
  LEGACY_DIFF_NOTE_TYPE,
  DIFF_NOTE_TYPE,
  NEW_LINE_TYPE,
  OLD_LINE_TYPE,
  MATCH_LINE_TYPE,
  LINES_TO_BE_RENDERED_DIRECTLY,
  MAX_LINES_TO_BE_RENDERED,
} from '../constants';

export function findDiffFile(files, hash) {
  return files.filter(file => file.file_hash === hash)[0];
}

export const getReversePosition = linePosition => {
  if (linePosition === LINE_POSITION_RIGHT) {
    return LINE_POSITION_LEFT;
  }

  return LINE_POSITION_RIGHT;
};

export function getFormData(params) {
  const {
    note,
    noteableType,
    noteableData,
    diffFile,
    noteTargetLine,
    diffViewType,
    linePosition,
    positionType,
  } = params;

  const position = JSON.stringify({
    base_sha: diffFile.diff_refs.base_sha,
    start_sha: diffFile.diff_refs.start_sha,
    head_sha: diffFile.diff_refs.head_sha,
    old_path: diffFile.old_path,
    new_path: diffFile.new_path,
    position_type: positionType || TEXT_DIFF_POSITION_TYPE,
    old_line: noteTargetLine ? noteTargetLine.old_line : null,
    new_line: noteTargetLine ? noteTargetLine.new_line : null,
    x: params.x,
    y: params.y,
    width: params.width,
    height: params.height,
  });

  const postData = {
    view: diffViewType,
    line_type: linePosition === LINE_POSITION_RIGHT ? NEW_LINE_TYPE : OLD_LINE_TYPE,
    merge_request_diff_head_sha: diffFile.diff_refs.head_sha,
    in_reply_to_discussion_id: '',
    note_project_id: '',
    target_type: noteableData.targetType,
    target_id: noteableData.id,
    return_discussion: true,
    note: {
      note,
      position,
      noteable_type: noteableType,
      noteable_id: noteableData.id,
      commit_id: '',
      type:
        diffFile.diff_refs.start_sha && diffFile.diff_refs.head_sha
          ? DIFF_NOTE_TYPE
          : LEGACY_DIFF_NOTE_TYPE,
      line_code: noteTargetLine ? noteTargetLine.line_code : null,
    },
  };

  return postData;
}

export function getNoteFormData(params) {
  const data = getFormData(params);

  return {
    endpoint: params.noteableData.create_note_path,
    data,
  };
}

export const findIndexInInlineLines = (lines, lineNumbers) => {
  const { oldLineNumber, newLineNumber } = lineNumbers;

  return _.findIndex(
    lines,
    line => line.old_line === oldLineNumber && line.new_line === newLineNumber,
  );
};

export const findIndexInParallelLines = (lines, lineNumbers) => {
  const { oldLineNumber, newLineNumber } = lineNumbers;

  return _.findIndex(
    lines,
    line =>
      line.left &&
      line.right &&
      line.left.old_line === oldLineNumber &&
      line.right.new_line === newLineNumber,
  );
};

export function removeMatchLine(diffFile, lineNumbers, bottom) {
  const indexForInline = findIndexInInlineLines(diffFile.highlighted_diff_lines, lineNumbers);
  const indexForParallel = findIndexInParallelLines(diffFile.parallel_diff_lines, lineNumbers);
  const factor = bottom ? 1 : -1;

  diffFile.highlighted_diff_lines.splice(indexForInline + factor, 1);
  diffFile.parallel_diff_lines.splice(indexForParallel + factor, 1);
}

export function addLineReferences(lines, lineNumbers, bottom) {
  const { oldLineNumber, newLineNumber } = lineNumbers;
  const lineCount = lines.length;
  let matchLineIndex = -1;

  const linesWithNumbers = lines.map((l, index) => {
    if (l.type === MATCH_LINE_TYPE) {
      matchLineIndex = index;
    } else {
      Object.assign(l, {
        old_line: bottom ? oldLineNumber + index + 1 : oldLineNumber + index - lineCount,
        new_line: bottom ? newLineNumber + index + 1 : newLineNumber + index - lineCount,
      });
    }

    return l;
  });

  if (matchLineIndex > -1) {
    const line = linesWithNumbers[matchLineIndex];
    const targetLine = bottom
      ? linesWithNumbers[matchLineIndex - 1]
      : linesWithNumbers[matchLineIndex + 1];

    Object.assign(line, {
      meta_data: {
        old_pos: targetLine.old_line,
        new_pos: targetLine.new_line,
      },
    });
  }

  return linesWithNumbers;
}

export function addContextLines(options) {
  const { inlineLines, parallelLines, contextLines, lineNumbers } = options;
  const normalizedParallelLines = contextLines.map(line => ({
    left: line,
    right: line,
  }));

  if (options.bottom) {
    inlineLines.push(...contextLines);
    parallelLines.push(...normalizedParallelLines);
  } else {
    const inlineIndex = findIndexInInlineLines(inlineLines, lineNumbers);
    const parallelIndex = findIndexInParallelLines(parallelLines, lineNumbers);
    inlineLines.splice(inlineIndex, 0, ...contextLines);
    parallelLines.splice(parallelIndex, 0, ...normalizedParallelLines);
  }
}

/**
 * Trims the first char of the `richText` property when it's either a space or a diff symbol.
 * @param {Object} line
 * @returns {Object}
 */
export function trimFirstCharOfLineContent(line = {}) {
  // eslint-disable-next-line no-param-reassign
  delete line.text;
  // eslint-disable-next-line no-param-reassign
  line.discussions = [];

  const parsedLine = Object.assign({}, line);

  if (line.rich_text) {
    const firstChar = parsedLine.rich_text.charAt(0);

    if (firstChar === ' ' || firstChar === '+' || firstChar === '-') {
      parsedLine.rich_text = line.rich_text.substring(1);
    }
  }

  return parsedLine;
}

// This prepares and optimizes the incoming diff data from the server
// by setting up incremental rendering and removing unneeded data
export function prepareDiffData(diffData) {
  const filesLength = diffData.diff_files.length;
  let showingLines = 0;
  for (let i = 0; i < filesLength; i += 1) {
    const file = diffData.diff_files[i];

    if (file.parallel_diff_lines) {
      const linesLength = file.parallel_diff_lines.length;
      for (let u = 0; u < linesLength; u += 1) {
        const line = file.parallel_diff_lines[u];
        if (line.left) {
          line.left = trimFirstCharOfLineContent(line.left);
          line.left.hasForm = false;
        }
        if (line.right) {
          line.right = trimFirstCharOfLineContent(line.right);
          line.right.hasForm = false;
        }
      }
    }

    if (file.highlighted_diff_lines) {
      const linesLength = file.highlighted_diff_lines.length;
      for (let u = 0; u < linesLength; u += 1) {
        const line = file.highlighted_diff_lines[u];
        Object.assign(line, { ...trimFirstCharOfLineContent(line), hasForm: false });
      }
      showingLines += file.parallel_diff_lines.length;
    }

    Object.assign(file, {
      renderIt: showingLines < LINES_TO_BE_RENDERED_DIRECTLY,
      collapsed: file.text && showingLines > MAX_LINES_TO_BE_RENDERED,
      discussions: [],
    });
  }
}

export function getDiffPositionByLineCode(diffFiles) {
  return diffFiles.reduce((acc, diffFile) => {
    // We can only use highlightedDiffLines to create the map of diff lines because
    // highlightedDiffLines will also include every parallel diff line in it.
    if (diffFile.highlighted_diff_lines) {
      diffFile.highlighted_diff_lines.forEach(line => {
        if (line.line_code) {
          acc[line.line_code] = {
            base_sha: diffFile.diff_refs.base_sha,
            head_sha: diffFile.diff_refs.head_sha,
            start_sha: diffFile.diff_refs.start_sha,
            new_path: diffFile.new_path,
            old_path: diffFile.old_path,
            old_line: line.old_line,
            new_line: line.new_line,
            line_code: line.line_code,
            position_type: 'text',
          };
        }
      });
    }

    return acc;
  }, {});
}

// This method will check whether the discussion is still applicable
// to the diff line in question regarding different versions of the MR
export function isDiscussionApplicableToLine({ discussion, diffPosition, latestDiff }) {
  const { line_code, ...diffPositionCopy } = diffPosition;

  if (discussion.original_position && discussion.position) {
    const originalRefs = discussion.original_position;
    const refs = discussion.position;

    return _.isEqual(refs, diffPositionCopy) || _.isEqual(originalRefs, diffPositionCopy);
  }

  // eslint-disable-next-line
  return latestDiff && discussion.active && line_code === discussion.line_code;
}

export const generateTreeList = files =>
  files.reduce(
    (acc, file) => {
      const split = file.new_path.split('/');

      split.forEach((name, i) => {
        const parent = acc.treeEntries[split.slice(0, i).join('/')];
        const path = `${parent ? `${parent.path}/` : ''}${name}`;

        if (!acc.treeEntries[path]) {
          const type = path === file.new_path ? 'blob' : 'tree';
          acc.treeEntries[path] = {
            key: path,
            path,
            name,
            type,
            tree: [],
          };

          const entry = acc.treeEntries[path];

          if (type === 'blob') {
            Object.assign(entry, {
              changed: true,
              tempFile: file.new_file,
              deleted: file.deleted_file,
              fileHash: file.file_hash,
              addedLines: file.added_lines,
              removedLines: file.removed_lines,
            });
          } else {
            Object.assign(entry, {
              opened: true,
            });
          }

          (parent ? parent.tree : acc.tree).push(entry);
        }
      });

      return acc;
    },
    { treeEntries: {}, tree: [] },
  );

export const getDiffMode = diffFile => {
  const diffModeKey = Object.keys(diffModes).find(key => diffFile[`${key}_file`]);
  return diffModes[diffModeKey] || diffModes.replaced;
};
