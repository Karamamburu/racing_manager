export type PolicyDocument = {
  slug: string;
  title: string;
  description: string;
};

export const policyDocuments: PolicyDocument[] = [
  {
    slug: 'privacy',
    title: 'Политика конфиденциальности',
    description: 'Как портал собирает, хранит и обрабатывает персональные данные.',
  },
  {
    slug: 'cookies',
    title: 'Политика использования файлов cookie',
    description: 'Какие cookies применяются, для каких целей и как отозвать согласие.',
  },
  {
    slug: 'personal-data',
    title: 'Согласие на обработку персональных данных',
    description: 'Условия согласия субъекта персональных данных на обработку сведений.',
  },
];

export function findPolicyDocument(slug: string | undefined) {
  return policyDocuments.find((document) => document.slug === slug);
}
