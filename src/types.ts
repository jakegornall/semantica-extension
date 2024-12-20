export interface SemanticChunk {
    title: string;
    description: string;
    examples: Example[];
    tags: string[];
    generated_timestamp: string;
    approved: boolean;
}

export interface Example {
    code: string;
    explanation: string;
}

export interface SemanticFile {
    metadata: {
        generated_at: string;
        chunk_count: number;
        version: string;
    };
    reasoning_and_planning: string[];
    chunks: SemanticChunk[];
} 