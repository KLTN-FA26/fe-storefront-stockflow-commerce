import { ChatNewScreen } from "@/features/chat";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** `?kind=&id=`: the document the customer opens the conversation about (STORE_ROUTES.chat.about). */
export default async function NewChatPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <ChatNewScreen kind={first(params.kind)} id={first(params.id)} />;
}
