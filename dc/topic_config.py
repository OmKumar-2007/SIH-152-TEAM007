
class TopicConfig:
   

    def __init__(self):
        self.x_search_queries = [
            # National / India
            "India",
            "Indian news",
            "India government",
            "India politics",
            "India economy",
            "India business",
            "India technology",

            # Telangana / Hyderabad
            "Telangana",
            "Telangana government",
            "Telangana politics",
            "Hyderabad",

            # Public-interest topics
            "India security",
            "India defence",
            "India infrastructure",
            "India jobs",
            "India education",
            "India protest",
        ]

        self.category_keywords = {
            "politics": [
                "government",
                "minister",
                "election",
                "elections",
                "parliament",
                "politics",
                "political",
                "BJP",
                "Congress",
                "prime minister",
                "chief minister",
                "MP",
                "MLA",
            ],

            "economy": [
                "economy",
                "economic",
                "GDP",
                "inflation",
                "RBI",
                "rupee",
                "interest rate",
                "stock market",
                "business",
                "trade",
                "investment",
            ],

            "technology": [
                "technology",
                "technology",
                "tech",
                "AI",
                "artificial intelligence",
                "software",
                "startup",
                "cyber",
                "cybersecurity",
                "internet",
            ],

            "security": [
                "security",
                "terrorism",
                "terrorist",
                "attack",
                "border",
                "military",
                "army",
                "police",
                "defence",
                "defense",
            ],

            "infrastructure": [
                "infrastructure",
                "road",
                "roads",
                "railway",
                "railways",
                "metro",
                "airport",
                "highway",
                "construction",
            ],

            "social": [
                "protest",
                "protests",
                "education",
                "students",
                "employment",
                "jobs",
                "unemployment",
                "healthcare",
                "society",
            ],
        }

    def get_x_search_queries(self):
        return self.x_search_queries

    def extract_tags_and_categories(self, text):
        
        text_lower = (text or "").lower()

        tags = []
        categories = []

        for category, keywords in self.category_keywords.items():
            category_matched = False

            for keyword in keywords:
                if keyword.lower() in text_lower:
                    tags.append(keyword)
                    category_matched = True

            if category_matched:
                categories.append(category)

        tags = list(dict.fromkeys(tags))
        categories = list(dict.fromkeys(categories))

        return tags, categories


topic_config = TopicConfig()
