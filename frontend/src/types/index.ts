export type UserRole = 'admin' | 'student';

export interface Profile {
  id: string;
  name: string;
  surname: string;
  unique_id: string | null;
  role: UserRole;
  points: number;
  is_active: boolean;
  username?: string;
  created_at: string;
}

export type ContentLanguage = 'kz' | 'ru';

export interface Topic {
  id: string;
  title: string;
  description?: string;
  order_index: number;
  is_draft: boolean;
  is_published: boolean;
  language: ContentLanguage;
  created_at: string;
}

export interface SubTopic {
  id: string;
  topic_id: string;
  title: string;
  order_index: number;
  is_draft: boolean;
  is_published: boolean;
  language: ContentLanguage;
  created_at: string;
}

export interface Lesson {
  id: string;
  subtopic_id: string;
  title: string;
  explanation?: string;
  content_blocks: ContentBlock[];
  order_index: number;
  is_draft: boolean;
  is_published: boolean;
  language: ContentLanguage;
  created_at: string;
}

export type ProblemType = 'mcq' | 'open';

export interface OpenAnswer {
  type: 'single' | 'set';
  value?: number;
  values?: number[];
}

export interface Problem {
  id: string;
  subsubtopic_id: string;
  title?: string;
  question: string;
  problem_type: ProblemType;
  options: string[];
  correct_option: number;
  correct_options: number[];
  open_answer?: OpenAnswer | null;
  image_url?: string | null;
  hint1?: string;
  is_hard: boolean;
  is_draft: boolean;
  is_published: boolean;
  order_index: number;
  created_at: string;
  // Bulk-upload fields
  level?: string | null;
  number?: number | null;
  answer_text?: string | null;
  source_file_url?: string | null;
  language?: ContentLanguage;
}

export interface UploadResult {
  imported: number;
  auto_published: boolean;
  source_file_url: string;
  lessons_created: number;
  errors: { zadacha: number; reason: string }[];
  skipped: { text: string; reason: string }[];
}

// Admin-facing: full bilingual queue row, one per scheduled day
export interface PodAdminOut {
  id: string;
  date: string;
  question_kz: string;
  question_ru: string;
  description_kz?: string | null;
  description_ru?: string | null;
  correct_answer: string;
  active_from: string;
  active_until: string;
  created_at: string;
  image_url?: string | null;
}

// Student-facing: only today's pod, resolved to the requested language
export interface PodStatusOut {
  status: 'available' | 'locked' | 'none';
  pod_id?: string | null;
  question?: string | null;
  description?: string | null;
  image_url?: string | null;
}

export interface ProblemAttempt {
  id: string;
  student_id: string;
  problem_id: string;
  is_correct: boolean;
  hints_used: number;
  points_earned: number;
  selected_options: number[];
  open_answer_given?: string | null;
  is_skip?: boolean;
  attempted_at: string;
}

export interface PodAttempt {
  id: string;
  student_id: string;
  pod_id: string;
  is_correct: boolean;
  points_earned: number;
  answer?: string;
  attempted_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  surname: string;
  unique_id: string | null;
  points: number;
}

export interface ContinueProgress {
  lesson_id: string;
  lesson_title: string;
  subtopic_title: string;
  topic_id: string;
  topic_title: string;
  attempted_count: number;
  total_count: number;
}

// Test Bank
export interface TestBankProblem {
  id: string;
  number: number;
  language: ContentLanguage;
  question: string;
  problem_type: ProblemType;
  options: string[];
  correct_option: number;
  correct_options: number[];
  open_answer?: OpenAnswer | null;
  image_url?: string | null;
  is_published: boolean;
  is_draft: boolean;
  created_at: string;
}

export interface ExamQuestion {
  id: string;
  number: number;
  question: string;
  problem_type: ProblemType;
  options: string[];
  image_url?: string | null;
}

export interface ExamResultRow {
  number: number;
  question: string;
  problem_type: ProblemType;
  given_selected_options?: number[] | null;
  given_open_answer?: string | null;
  is_correct: boolean;
}

export type ExamStatus = 'not_started' | 'in_progress' | 'submitted';

export interface ExamStatusOut {
  status: ExamStatus;
  started_at?: string | null;
  duration_seconds: number;
  questions?: ExamQuestion[] | null;
  results?: ExamResultRow[] | null;
  score?: number | null;
  total?: number | null;
  terminated_early?: boolean | null;
}

export interface ProblemReport {
  id: string;
  problem_id: string;
  student_id: string;
  description: string;
  status: 'pending' | 'resolved' | 'dismissed';
  admin_note?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

// Content blocks
export type BlockType = 'text' | 'formula' | 'image' | 'heading';
export interface TextBlock    { type: 'text';    content: string }
export interface FormulaBlock { type: 'formula'; latex: string }
export interface ImageBlock   { type: 'image';   url: string; caption?: string }
export interface HeadingBlock { type: 'heading'; level: 1 | 2 | 3; content: string }
export type ContentBlock = TextBlock | FormulaBlock | ImageBlock | HeadingBlock;

// Topic tree (returned by /api/topics/tree)
export interface LessonInTree {
  id: string;
  title: string;
  explanation?: string;
  content_blocks: ContentBlock[];
  is_completed: boolean;
  has_content: boolean;
  problem_count: number;
  attempted_count: number;
  is_draft: boolean;
  is_published: boolean;
  order_index: number;
}

export interface SubTopicInTree {
  id: string;
  title: string;
  order_index: number;
  is_draft: boolean;
  is_published: boolean;
  lessons: LessonInTree[];
}

export interface TopicInTree {
  id: string;
  title: string;
  description?: string;
  order_index: number;
  is_draft: boolean;
  is_published: boolean;
  subtopics: SubTopicInTree[];
  completed_lessons: number;
  total_lessons: number;
}
