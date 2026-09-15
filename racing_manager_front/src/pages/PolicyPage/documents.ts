export type PolicyDocument = {
  slug: string;
  title: string;
  description: string;
  published: boolean;
};

export const policyDocuments: PolicyDocument[] = [
  {
    slug: 'privacy',
    title: 'Политика конфиденциальности',
    description: 'Как портал собирает, хранит и обрабатывает персональные данные.',
    published: true,
  },
  {
    slug: 'cookies',
    title: 'Политика использования файлов cookie',
    description: 'Какие cookies применяются, для каких целей и как отозвать согласие.',
    published: true,
  },
  {
    slug: 'personal-data',
    title: 'Согласие на обработку персональных данных',
    description: 'Условия согласия субъекта персональных данных на обработку сведений.',
    published: true,
  },
];

export function findPolicyDocument(slug: string | undefined) {
  return policyDocuments.find((document) => document.slug === slug);
}
