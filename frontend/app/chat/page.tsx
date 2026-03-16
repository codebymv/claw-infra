import { Metadata } from 'next';
import { WebChat } from '@/components/chat/web-chat';

export const metadata: Metadata = {
  title: 'Chat - Claw Infra',
  description: 'Real-time chat interface for interacting with the system',
};

export default function ChatPage() {
  return (
    <div className="container mx-auto p-6 h-[calc(100vh-4rem)]">
      <div className="h-full max-w-4xl mx-auto">
        <WebChat className="h-full" />
      </div>
    </div>
  );
}