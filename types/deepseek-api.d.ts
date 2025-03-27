declare module 'deepseek-api' {
  export function createNewChat(token: string, id?: string): Promise<string | { error: string }>;
  export function sendMessage(
    text: string, 
    chat: { id: string; token: string; parent_id?: string }, 
    callback: (data: any) => void
  ): Promise<any>;
  export const chats: Map<string, {
    token: string;
    id: string;
    messages: any[];
  }>;
  export function requestChatStream(payload: object, text: string): Promise<any>;
  export function streamResponse(response: any, callback: (data: any) => void): Promise<any>;
}