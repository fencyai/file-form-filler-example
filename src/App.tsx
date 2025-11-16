import { useCreateFiles, useStructuredChatCompletions } from '@fencyai/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Button, TextInput } from '@mantine/core'
import AwsS3 from '@uppy/aws-s3'
import Uppy from '@uppy/core'
import '@uppy/core/css/style.min.css'
import '@uppy/dashboard/css/style.min.css'
import Dashboard from '@uppy/react/dashboard'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

const formSchema = z.object({
    companyName: z.string(),
    email: z.string(),
    address: z.string(),
})

const suggestionsSchema = z.object({
    companyNames: z.array(z.string()),
    emails: z.array(z.string()),
    fullAddresses: z.array(z.string()),
})

type AppState =
    | 'waiting_for_file'
    | 'getting_file_text_content'
    | 'getting_suggestions'
    | 'suggestions_received'

export default function App() {
    const chatCompletions = useStructuredChatCompletions()
    const [formSubmitted, setFormSubmitted] = useState(false)
    const [state, setState] = useState<AppState>('waiting_for_file')
    const [suggestions, setSuggestions] = useState<z.infer<
        typeof suggestionsSchema
    > | null>(null)
    const form = useForm({
        resolver: zodResolver(formSchema),
    })
    const { createFile } = useCreateFiles({
        async onUploadCompleted() {
            setState('getting_file_text_content')
        },
        async onTextContentReady(event) {
            setState('getting_suggestions')
            const response =
                await chatCompletions.createStructuredChatCompletion({
                    responseFormat: suggestionsSchema,
                    openai: {
                        messages: [
                            {
                                role: 'user',
                                content:
                                    'Find suggestions for the following form based on this content. Make sure to include all the relevant datapoints you can find ' +
                                    event.textContent,
                            },
                        ],
                        model: 'gpt-4.1-nano',
                    },
                })

            if (response.type === 'success') {
                setSuggestions(response.data.structuredResponse)
                setState('suggestions_received')
            }
        },
    })

    const uppy = useMemo(() => {
        const u = new Uppy({
            restrictions: {
                maxNumberOfFiles: 1,
                allowedFileTypes: ['application/pdf'],
            },
            autoProceed: false,
        })

        u.use(AwsS3, {
            getUploadParameters: async (file) => {
                if (file.size && file.name) {
                    const response = await createFile({
                        fileName: file.name,
                        fileSize: file.size,
                        fileType: file.type,
                    })

                    if (response.type !== 'success') {
                        throw Error('Could not create upload')
                    }

                    const p = response.file
                    const fields: Record<string, string> = {
                        key: p.s3PostRequest.key,
                        policy: p.s3PostRequest.policy,
                        'x-amz-algorithm': p.s3PostRequest.xAmzAlgorithm,
                        'x-amz-credential': p.s3PostRequest.xAmzCredential,
                        'x-amz-date': p.s3PostRequest.xAmzDate,
                        'x-amz-signature': p.s3PostRequest.xAmzSignature,
                        'x-amz-security-token': p.s3PostRequest.sessionToken,
                    }

                    return {
                        url: p.s3PostRequest.uploadUrl,
                        method: 'POST',
                        fields,
                        headers: {},
                    }
                } else {
                    throw Error('Filename or size is null')
                }
            },
            shouldUseMultipart: false,
        })

        u.on('error', (error, file) => {
            console.log(
                `Error occured, ${error.name} ${error.message}, ${error.details}, ${file?.error}`
            )
        })

        return u
    }, [])

    const statusMeta = getStatusMeta(state)

    return (
        <div className="w-screen h-screen">
            <div className="flex flex-col gap-2 mb-2 max-w-2xl mx-auto mt-10">
                <span className="text-gray-500 text-sm">
                    You can use this example file if you want to try it out:
                    <br />
                    <Button
                        component={'a'}
                        mt="xs"
                        size="xs"
                        radius="xl"
                        target="_blank"
                        href="https://fency-public-content.s3.eu-west-1.amazonaws.com/CloudSentinel_Company_Description.pdf"
                        download={true}
                    >
                        Example file
                    </Button>
                </span>
                <form
                    onSubmit={form.handleSubmit(() => {
                        setFormSubmitted(true)
                    })}
                >
                    <TextInput
                        label="Company Name"
                        {...form.register('companyName')}
                        error={form.formState.errors.companyName?.message}
                    />
                    <Suggestions
                        suggestions={suggestions?.companyNames || []}
                        onClick={(companyName) =>
                            form.setValue('companyName', companyName)
                        }
                    />
                    <TextInput
                        label="Email"
                        {...form.register('email')}
                        error={form.formState.errors.email?.message}
                    />
                    <Suggestions
                        suggestions={suggestions?.emails || []}
                        onClick={(email) => form.setValue('email', email)}
                    />
                    <TextInput
                        label="Address"
                        {...form.register('address')}
                        error={form.formState.errors.address?.message}
                    />

                    <Suggestions
                        suggestions={suggestions?.fullAddresses || []}
                        onClick={(address) => form.setValue('address', address)}
                    />
                    <div className="min-h-36 overflow-y-auto bg-gray-100 p-4 rounded-md mb-2 flex flex-col justify-center items-center mt-2">
                        <div className="flex flex-col justify-center items-center w-full h-full">
                            <span className="text-gray-500">
                                {statusMeta.text}
                            </span>
                        </div>
                    </div>
                </form>
                {formSubmitted && (
                    <Alert
                        variant="light"
                        color="teal"
                        title="Form submitted successfully"
                    >
                        Form submitted successfully.
                    </Alert>
                )}
                <Dashboard uppy={uppy} width={'100%'} />
            </div>
        </div>
    )
}

function Suggestions({
    suggestions,
    onClick,
}: {
    suggestions: string[]
    onClick: (suggestion: string) => void
}) {
    return (
        <div className="flex gap-1 mt-2">
            {suggestions.map((suggestion) => (
                <Suggestion
                    key={suggestion}
                    value={suggestion}
                    onClick={() => onClick(suggestion)}
                />
            ))}
        </div>
    )
}

function Suggestion({
    value,
    onClick,
}: {
    value: string
    onClick: () => void
}) {
    return (
        <Button
            color="grape"
            size="xs"
            radius={'lg'}
            className="h-2"
            onClick={onClick}
        >
            {value}
        </Button>
    )
}

const getStatusMeta = (
    state: AppState
): {
    text: string
} => {
    switch (state) {
        case 'waiting_for_file':
            return {
                text: 'Waiting for your file!',
            }
        case 'getting_suggestions':
            return {
                text: 'Getting suggestions...',
            }
        case 'suggestions_received':
            return {
                text: 'Suggestions received!',
            }
        case 'getting_file_text_content':
            return {
                text: 'Getting file text content...',
            }
    }
}
