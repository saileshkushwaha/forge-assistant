package ai.forge.assistant;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.net.URI;
import org.junit.Test;

public class AndroidAppLinkTest {
    private static final String HOST = "dev-assistant.forge.ai";

    @Test
    public void acceptsTheFlavorHostAndPreservesTheFullUrl() {
        String raw =
            "https://dev-assistant.forge.ai/assistant/conversations/conv-xyz?next=%2Fassistant%2Fplans#reply%2Fmessage-123";

        URI appLink = AndroidAppLink.parse(raw, HOST);

        assertEquals(raw, appLink.toASCIIString());
        assertEquals(
            "https://dev-assistant.forge.ai/assistant/pair?deviceCode=device-123#approval",
            AndroidAppLink.parse(
                "https://dev-assistant.forge.ai/assistant/pair?deviceCode=device-123#approval",
                HOST
            ).toASCIIString()
        );
        assertEquals(
            "https://dev-assistant.forge.ai/account/oauth/complete?requestId=request-123",
            AndroidAppLink.parse(
                "https://dev-assistant.forge.ai/account/oauth/complete?requestId=request-123",
                HOST
            ).toASCIIString()
        );
        assertEquals(
            "https://dev-assistant.forge.ai/assistant/settings/billing/upgrade/success",
            AndroidAppLink.parse(
                "https://dev-assistant.forge.ai/assistant/settings/billing/upgrade/success",
                HOST
            ).toASCIIString()
        );
    }

    @Test
    public void rejectsOtherFlavorsAndNonHttpsUrls() {
        assertNull(
            AndroidAppLink.parse("https://www.forge.ai/assistant/conversations/conv-xyz", HOST)
        );
        assertNull(AndroidAppLink.parse("http://dev-assistant.forge.ai/assistant", HOST));
        assertNull(
            AndroidAppLink.parse("https://dev-assistant.forge.ai:444/assistant", HOST)
        );
    }

    @Test
    public void rejectsUnownedAndEncodedPaths() {
        assertNull(AndroidAppLink.parse("https://dev-assistant.forge.ai/assistant/logs", HOST));
        assertNull(
            AndroidAppLink.parse("https://dev-assistant.forge.ai/assistant/pairing", HOST)
        );
        assertNull(
            AndroidAppLink.parse(
                "https://dev-assistant.forge.ai/assistant/conversations/../logs",
                HOST
            )
        );
        assertNull(
            AndroidAppLink.parse(
                "https://dev-assistant.forge.ai/assistant/conversations/%2e%2e/logs",
                HOST
            )
        );
    }
}
